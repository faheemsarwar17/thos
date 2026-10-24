from datetime import UTC, datetime, timedelta

import pytest

from app.proctoring import policy

T0 = datetime(2026, 1, 1, 12, 0, 0, tzinfo=UTC)


def rec():
    return policy.new_record(enabled=True, kind="applied", now=T0)


def apply(r, type_, seconds, **kw):
    return policy.apply_event(
        r,
        type_=type_,
        now=T0 + timedelta(seconds=seconds),
        max_warnings=2,
        cooldown_seconds=20,
        flag_dedup_seconds=30,
        **kw,
    )


def ack(r, strike, seconds):
    policy.acknowledge(r, strike=strike, now=T0 + timedelta(seconds=seconds))


def test_two_warnings_then_terminate():
    r = rec()
    d1 = apply(r, "gaze_off_screen_sustained", 0)
    assert (d1.action, d1.strike, d1.counted) == ("warn", 1, True)
    ack(r, 1, 5)
    d2 = apply(r, "tab_hidden", 30)
    assert (d2.action, d2.strike) == ("warn", 2)
    ack(r, 2, 35)
    d3 = apply(r, "face_missing", 60)
    assert (d3.action, d3.strike) == ("terminate", 3)
    assert r["terminated"]["reason"] == "gaze_violation"
    assert [s["type"] for s in r["terminated"]["strikes"]] == [
        "gaze_off_screen_sustained",
        "tab_hidden",
        "face_missing",
    ]
    assert policy.outcome(r) == "terminated"


def test_cooldown_and_pending_warning_do_not_count():
    r = rec()
    apply(r, "gaze_reading_pattern", 0)  # strike 1, warning pending
    d = apply(r, "gaze_repeated_glances", 2)
    assert (d.counted, d.note, d.action) == (False, "warning_pending", "none")
    ack(r, 1, 3)
    d = apply(r, "window_blur", 10)  # < 20 s after strike 1
    assert (d.counted, d.note) == (False, "cooldown")
    assert r["strikes"] == 1


def test_after_termination_is_ignored():
    r = rec()
    for i, s in enumerate((0, 30, 60), start=1):
        apply(r, "face_missing", s)
        if i < 3:
            ack(r, i, s + 1)
    d = apply(r, "face_missing", 120)
    assert (d.counted, d.note, d.action) == (False, "after_termination", "none")


def test_flags_never_count_and_are_deduped():
    r = rec()
    d = apply(r, "voice_mismatch", 0, metrics={"cosine": 0.1})
    assert (d.action, d.counted) == ("none", False)
    d = apply(r, "voice_mismatch", 10)
    assert d.note == "deduplicated"
    assert sum(e["type"] == "voice_mismatch" for e in r["events"]) == 1
    apply(r, "multiple_faces", 40)
    assert r["strikes"] == 0
    assert policy.outcome(r) == "flagged"


def test_clean_outcome_and_unknown_type():
    r = rec()
    policy.record_session_event(r, type_="consent_given", now=T0)
    assert policy.outcome(r) == "clean"
    with pytest.raises(ValueError):
        apply(r, "made_up", 0)


def test_acknowledge_wrong_strike_raises():
    r = rec()
    apply(r, "tab_hidden", 0)
    with pytest.raises(policy.PolicyError):
        policy.acknowledge(r, strike=2, now=T0)


def test_event_cap_keeps_strikes():
    r = rec()
    apply(r, "tab_hidden", 0)
    for i in range(600):
        policy.record_session_event(r, type_="enrolment_fallback", now=T0 + timedelta(seconds=i))
    assert len(r["events"]) <= policy.MAX_EVENTS
    assert any(e.get("counted") for e in r["events"])


def test_candidate_view_hides_flags_and_events():
    r = rec()
    apply(r, "voice_mismatch", 0)
    apply(r, "tab_hidden", 1)
    r["calibration"] = {
        "completed_at": "x",
        "face_presence": 0.9,
        "envelope": {
            "yaw": [-10, 10],
            "pitch": [-8, 8],
            "iris_h": [0.4, 0.6],
            "iris_v": [0.4, 0.6],
        },
    }
    v = policy.public_view(r, audience="candidate", max_warnings=2)
    assert "events" not in v and "counts" not in v and "outcome" not in v
    assert v["warnings_used"] == 1 and v["pending_warning"]["strike"] == 1
    assert v["envelope"] == {
        "yaw": [-10, 10],
        "pitch": [-8, 8],
        "irisH": [0.4, 0.6],
        "irisV": [0.4, 0.6],
    }


def test_employer_view_has_counts_and_outcome():
    r = rec()
    apply(r, "voice_mismatch", 0)
    v = policy.public_view(r, audience="employer", max_warnings=2)
    assert v["outcome"] == "flagged" and v["counts"]["flags"]["voice_mismatch"] == 1


def test_reason_messages_cover_all_violation_types():
    for t in policy.GAZE_VIOLATIONS:
        assert policy.reason_message(t)


def test_config_reads_settings_and_client_view_is_camel_case():
    from app.core.config import Settings
    from app.proctoring.config import ProctoringConfig

    cfg = ProctoringConfig.from_settings(Settings())
    assert cfg.gaze_sustained_seconds == 10.0
    assert cfg.max_warnings == 2
    view = cfg.client_view()
    assert view["sustainedS"] == 10.0 and view["maxWarnings"] == 2
    assert view["policyVersion"] == "proctoring-v1"
    assert "accommodationEmail" in view
