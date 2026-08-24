# Intel demo shot list

## Recording preconditions

- Use the project-authored synthetic lecture from `demo/demo-manifest.json`.
- Start inside the authenticated lecture player; do not spend video time on login, upload, or navigation.
- Use already-prepared Event, Q↔A, Context Recovery, supported Ask, and unsupported Ask states from that same lecture.
- Do not reprocess the lecture or make a real-provider call solely for recording. If a prepared Ask state is unavailable, omit that insert rather than spend quota.
- Keep the “small synthetic human-verified evaluation” label visible with metrics.
- Check browser zoom, focus visibility, captions, network/cache state, and presenter timing.
- Keep private data, secrets, logs, developer tools, and local paths out of frame.
- Prepare the final metric card before recording: Event precision 20/20, VI/EN full-recall Event recall 11/12, and Context grounding 51/51.

## Shots

| Time | Shot | Action | Proof shown |
|---|---|---|---|
| 0:00–0:15 | Lost learning thread | Begin at a later player position with the long transcript visible. | Captions expose words but do not directly reconstruct what changed during a missed interval. |
| 0:15–0:40 | Recover the missed window | Select a Context Recovery window and reveal the prepared “I missed this part” result. | Recovery is bounded to the recent lecture interval, not a generic whole-lecture summary. |
| 0:40–1:05 | Reconstruct the path | Point to a topic change, question, linked answer, and example/important item; briefly reveal the Q↔A relation. | Semantic structure and the relationship between ideas, rather than a flat transcript. |
| 1:05–1:20 | Verify the source | Activate one recovery citation and show the player seeking to the evidence. | Backend-validated source mapping and backend-derived timestamp. |
| 1:20–1:35 | Ask a grounded follow-up | Show a prepared supported answer and its citation without leaving the lecture. | Current-lecture grounding and evidence-linked continuation. |
| 1:35–1:45 | Abstain safely | Show a prepared unsupported question with the abstention state and no citations. | No outside-knowledge guess when lecture evidence is insufficient. |
| 1:45–2:00 | Evidence and limits | Show the compact verified metric card and one-reviewer/universal-effectiveness limitation. | Honest small synthetic human-verified measurement, including its boundary. |

The learning-continuity journey occupies 80 of 120 seconds (66.7%).

## Do not show or claim

- `.env`, API keys, email addresses, private URLs, logs, database contents, or local paths
- private or unresolved-provenance media
- fixture-only fake-provider output as model-quality evidence
- “100% accurate AI,” statistical significance, or universal Deaf and Hard-of-Hearing effectiveness
- user-pilot, measured learning-outcome, WCAG-conformance, production-deployment, or Intel/OpenVINO-acceleration claims
- roadmap-only gap detection, automatic attention inference, or a resume-check feature as if already implemented
- more detail than can be explained clearly within the two-minute narrative

## Final submission checks

- Confirm the uploaded video duration is at most 2:00 and that speech remains understandable at normal speed.
- Confirm the form description stays within its word limit and matches the final submitted language.
- Confirm every displayed metric matches `evaluation/results/verified_metrics.json`.
- Save the final video, submitted text, submission confirmation, and repository commit SHA when a repository link is included.
- If the form requires a URL, prefer an accepted repository or demo-video URL; do not rush a production deployment solely for submission.
