---
kind: business_term
name: Business Glossary
category: business_term
scope:
    - '**'
---

### PFP
- Definition：Profile photo stored per candidate account. Used as the reference face for identity verification during voice interviews: the interview UI captures one webcam frame and the backend compares it against the stored PFP, returning a verdict of match, ambiguous, mismatch, no_reference_photo, or unavailable.
- Aliases：profile photo、avatar

### Identity verdict
- Definition：The result of comparing a live webcam capture against a candidate's PFP during a voice interview. Possible values: match, ambiguous, mismatch, no_reference_photo, unavailable. Verdicts are recorded with the attempt and surfaced in the synthesized report and employer application drawer; they never block the interview.
- Aliases：identity check result、face match verdict

### Domain pack
- Definition：A JSON manifest under `domain-packs/` that defines a hiring domain (e.g., education, software-engineering) including its persona, question pools, and evaluation criteria. Organizations select a domain pack during onboarding to configure their workflow templates.
- Aliases：pack、domain manifest

### Stage transition
- Definition：An idempotent, audited move of an application between pipeline stages (e.g., applied → interviewed → hired/rejected). Each transition triggers in-app notifications and, after the recent changes, an email to the candidate using templated content. Transitions include optimistic concurrency control via stage_version.
- Aliases：pipeline transition、application stage change

### Email template
- Definition：Per-organization customizable message templates for stage transitions, acceptances, and rejections. Templates support placeholders like {candidate_name}, {job_title}, {stage_label}, {message}. Admins can view, edit, and reset them via the organization email-template endpoints; defaults are predefined in code.
- Aliases：notification template、mail template

### Synthesis report
- Definition：The post-session analysis produced by the LLM after a voice interview ends. It summarizes the conversation, scores the candidate, lists concerns, and now includes identity-verdict statements when the live capture did not match the PFP or was unavailable.
- Aliases：interview synthesis、post-session report

### Voice interview
- Definition：A real-time audio session where a candidate speaks with an AI interviewer hosted in a LiveKit room. The session is transcribed, analyzed, and later synthesized into a report. Requires both LiveKit and an OpenAI key to be configured.
- Aliases：profile screening、voice screening、voice session

### CV parse / embedding matching
- Definition：The process of extracting structured data from a candidate's uploaded CV (PDF/DOCX), generating embeddings via the configured embedding model, and scoring job matches against posted jobs' embeddings. Results appear as job_match_score and job_match_reasons on applications.
- Aliases：CV matching、resume parsing、talent matching
