# Intel demo shot list

## Recording preconditions

- Use the project-authored synthetic lecture from `demo/demo-manifest.json`.
- Confirm that the cached Event, Q↔A, Context Recovery, supported Ask, and unsupported Ask states belong to that lecture.
- Keep the “small synthetic human-verified evaluation” label visible with metrics.
- Check browser zoom, focus visibility, captions, network/cache state, and presenter timing.
- Keep private data, secrets, logs, developer tools, and local paths out of frame.

## Shots

| Time | Shot | Action | Proof shown |
|---|---|---|---|
| 0:00–0:15 | Problem | Show a long transcript and the need to recover structure. | Clear problem statement without a universal accessibility claim. |
| 0:15–0:35 | Lecture access | Play the synthetic lecture and select timestamped transcript lines. | Legal demo provenance, captions, transcript, and seeking. |
| 0:35–0:55 | Semantic Timeline | Select topic change, question, linked answer, example, and important event. | Event structure, Q↔A navigation, and evidence-derived seek. |
| 0:55–1:15 | Context Recovery | Activate “I missed this part—what happened?” and open one result citation. | Bounded recent context and backend-derived timestamp. |
| 1:15–1:35 | Grounded Ask | Ask a supported question, open its citation, and seek to evidence. | Current-lecture grounding and citation mapping. |
| 1:35–1:50 | Abstention | Ask an unsupported question and show the fallback. | Responsible behavior when evidence is insufficient. |
| 1:50–2:00 | Evaluation | Show Event precision 20/20 and VI/EN full-recall match 11/12. | Human-verified measurement with an explicit small synthetic label. |

## Do not show or claim

- `.env`, API keys, email addresses, private URLs, logs, database contents, or local paths
- private or unresolved-provenance media
- fixture-only fake-provider output as model-quality evidence
- “100% accurate AI,” statistical significance, or universal Deaf and Hard-of-Hearing effectiveness
- more detail than can be explained clearly within the two-minute narrative
