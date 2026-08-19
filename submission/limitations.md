# Limitations

- No passing final real-provider smoke artifact is included in this repository snapshot; no provider-quality claim is available.
- The 45-minute VI/EN/code-switch set is project-authored synthetic transcript data, not recorded classroom diversity.
- Event annotations are author drafts awaiting two real team reviewers; Precision, Recall, and F1 remain null.
- Q-A, Context Recovery, and Grounded Ask reviews are pending; no quality score is reported.
- Lexical retrieval can miss paraphrases or retrieve weak overlap; the current diagnostic is small and not human gold.
- Confidence values are provider heuristics and are not calibrated probabilities.
- Ask Lecture is current-lecture-only and uses no web augmentation.
- Keyboard-only and screen-reader manual validation are blocked by the non-interactive environment.
- No deaf/hard-of-hearing user or accessibility expert pilot was run.
- Production Gemini and PostgreSQL acceptance was not run.
- The in-memory rate limiter is suitable only for a single-process local MVP.
- Product illustrations with unresolved provenance were removed and replaced by CSS/icon layouts; newly introduced media still requires an explicit provenance review.
- A repository license has not been selected.
