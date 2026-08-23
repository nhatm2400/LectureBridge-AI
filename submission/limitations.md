# Limitations

- The finalized quality evaluation contains three project-authored synthetic lectures totaling 45 minutes; it does not represent classroom diversity.
- One human reviewer manually verified the review artifacts, so no inter-rater reliability or independent secondary-review measure is reported.
- The set is too small for a statistical-significance claim.
- Results are specific to `gemini-3.5-flash-lite`, the provider-compatible endpoint, current prompts, and current fixtures.
- The evaluation does not establish universal effectiveness for Deaf and Hard-of-Hearing learners or measured learning outcomes.
- The full-recall Event subset covers VI and EN; one topic transition, `en-topic-serializable`, was missed.
- Ask citation correctness was 8/9, and one supported code-switch question incorrectly abstained.
- Context Recovery included one redundant case and one incomplete case.
- Retrieval can miss paraphrases or overvalue surface overlap; confidence values are heuristic rather than calibrated probabilities.
- Ask Lecture is restricted to the current lecture and uses no web augmentation.
- Keyboard-only and screen-reader validation still requires a documented human session.
- No Deaf or Hard-of-Hearing user or accessibility-expert pilot is claimed.
- The in-memory rate limiter is suitable only for a single-process local MVP; production deployment requires distributed operational controls.
- Runtime media requires separate permission and provenance review, and no repository license has been selected.
