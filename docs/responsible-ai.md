# Responsible AI

LectureBridge treats AI output as reviewable assistance, never as an authority.

## Controls

- Provider payloads are bounded to the task and current lecture.
- Transcript content is untrusted evidence and cannot override system policy.
- Structured responses are schema-validated with bounded retries.
- Evidence IDs must belong to the supplied set and current lesson.
- Timestamps and citations are derived by the backend.
- Unsupported or weakly retrieved questions abstain.
- Request size, evidence count, retry count, and rate are bounded.
- Authorized reviewers can confirm, correct, reject, and relink semantic output.
- Audit records preserve sanitized provenance and review history.
- Logs exclude raw prompts, transcripts, credentials, signed URLs, and private answers.

## Transparency

The UI exposes source-linked timestamps, event type, provenance, review state, inference status, and heuristic confidence where relevant. Confidence is not a calibrated probability. Synthetic fixtures and fake-provider tests are labeled as engineering evidence only.

## Human oversight

Automated reprocessing cannot silently replace reviewed content. Review endpoints cannot alter canonical evidence or timestamps. Rejected relations remain negative review memory for later reruns.

## Known limits

- Lexical retrieval can miss paraphrases or overvalue surface overlap.
- Provider behavior varies across language and code-switch inputs.
- Prompt-injection defenses reduce risk but are not a formal security proof.
- Model quality, accessibility effectiveness, and learning outcomes require real-provider outputs and appropriate human evaluation.
- The in-memory limiter is suitable only for a single-process deployment.
