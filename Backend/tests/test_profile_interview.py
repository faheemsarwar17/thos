from fastapi.testclient import TestClient

CANDIDATE = {"X-Development-Identity": "pi-candidate"}


def test_profile_and_consent_lifecycle(client: TestClient) -> None:
    profile = client.get("/api/v1/candidates/me/profile", headers=CANDIDATE).json()["candidate"]
    assert profile["consents"]["discovery"] is False  # off by default (rules.md §5.1)

    updated = client.patch(
        "/api/v1/candidates/me/profile",
        headers=CANDIDATE,
        json={"headline": "Educator", "skills": ["pedagogy", "statistics"]},
    )
    assert updated.status_code == 200
    assert updated.json()["candidate"]["profile"]["headline"] == "Educator"

    consent = client.put(
        "/api/v1/candidates/me/consents/discovery", headers=CANDIDATE, json={"granted": True}
    )
    assert consent.status_code == 200
    assert consent.json()["consents"]["discovery"] is True

    unknown = client.put(
        "/api/v1/candidates/me/consents/mystery", headers=CANDIDATE, json={"granted": True}
    )
    assert unknown.status_code == 422


def test_profile_interview_attempt_lifecycle(client: TestClient) -> None:
    start = client.post(
        "/api/v1/candidates/me/profile-interview-attempts",
        headers=CANDIDATE,
        json={"pack_id": "education"},
    )
    assert start.status_code == 201
    attempt = start.json()["attempt"]
    assert attempt["resumed"] is False
    # Candidates never receive grading keys.
    assert all("expected_concepts" not in q for q in attempt["questions"])

    # Starting again recovers the same in-progress attempt (no duplicates).
    resume = client.post(
        "/api/v1/candidates/me/profile-interview-attempts",
        headers=CANDIDATE,
        json={"pack_id": "education"},
    )
    assert resume.json()["attempt"]["id"] == attempt["id"]
    assert resume.json()["attempt"]["resumed"] is True

    question_ids = [q["id"] for q in attempt["questions"]]
    autosave = client.patch(
        f"/api/v1/profile-interview-attempts/{attempt['id']}/responses",
        headers=CANDIDATE,
        json={
            "responses": {
                question_ids[0]: (
                    "I would review the learning outcomes and assessment design first. "
                    "Feedback from students guides the revision, and I would document "
                    "the root cause before changing anything."
                )
            }
        },
    )
    assert autosave.status_code == 200

    unknown_question = client.patch(
        f"/api/v1/profile-interview-attempts/{attempt['id']}/responses",
        headers=CANDIDATE,
        json={"responses": {"not-a-question": "text"}},
    )
    assert unknown_question.status_code == 422

    submit = client.post(
        f"/api/v1/profile-interview-attempts/{attempt['id']}/submit",
        headers=CANDIDATE,
        json={"idempotency_key": "pi-sub"},
    )
    assert submit.status_code == 200
    evaluation = submit.json()["evaluation"]
    assert evaluation["evaluator_version"]
    assert evaluation["pack_id"] == "education"
    assert 0 <= evaluation["overall_score"] <= 100
    # Evidence cites only real response segments.
    for result in evaluation["question_results"]:
        for cited in result["covered_concepts"]:
            assert cited["evidence"]

    # Submission is idempotent and the attempt becomes immutable.
    replay = client.post(
        f"/api/v1/profile-interview-attempts/{attempt['id']}/submit",
        headers=CANDIDATE,
        json={"idempotency_key": "pi-sub"},
    )
    assert replay.status_code == 200
    assert replay.json() == submit.json()

    after = client.patch(
        f"/api/v1/profile-interview-attempts/{attempt['id']}/responses",
        headers=CANDIDATE,
        json={"responses": {question_ids[0]: "changed"}},
    )
    assert after.status_code == 409

    # Cooldown blocks an immediate retake.
    retake = client.post(
        "/api/v1/candidates/me/profile-interview-attempts",
        headers=CANDIDATE,
        json={"pack_id": "education"},
    )
    assert retake.status_code == 409
    assert retake.json()["error"]["code"] == "attempt_cooldown_active"


def test_candidates_cannot_read_each_others_attempts(client: TestClient) -> None:
    start = client.post(
        "/api/v1/candidates/me/profile-interview-attempts",
        headers=CANDIDATE,
        json={"pack_id": "education"},
    ).json()["attempt"]

    other = {"X-Development-Identity": "other-candidate"}
    denied = client.get(
        f"/api/v1/profile-interview-attempts/{start['id']}", headers=other
    )
    assert denied.status_code == 404
