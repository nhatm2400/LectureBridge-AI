# Accessibility

LectureBridge is designed so the main learning journey can be operated without relying on audio, color, or pointer input alone.

## Implemented contracts

- Semantic headings and native buttons, links, form controls, and media controls.
- Visible focus styles and keyboard-operable timestamp seeking.
- Timestamped Vietnamese/English captions and transcript views.
- Text labels for event type, review state, inference status, and confidence.
- Polite live regions for asynchronous Context Recovery and Grounded Ask results.
- Reduced-motion support and non-color status cues.
- Citation controls that seek the protected player to backend-verified evidence.
- Loading, error, empty, and abstention states that do not intentionally move focus.

## Required manual validation

Automated lint and structural tests do not establish WCAG conformance. A human session should record browser, operating system, reviewer, date, and demo lecture ID, then verify:

1. Login, navigation, upload, playback, captions, transcript, and logout without a mouse.
2. Logical focus order and visible focus at 200% zoom and narrow reflow.
3. Semantic Timeline event names, state labels, seeking, and question-answer navigation.
4. Context window selection, result announcement, and timestamp activation.
5. Supported Ask, citation activation, unsupported abstention, loading, and error announcements.
6. Flashcard and quiz operation.
7. NVDA or Windows Narrator heading/control names and dynamic announcement order.
8. Color contrast, caption correctness, and representative deaf/hard-of-hearing learner feedback.

Status in this repository: `NOT_RUN — HUMAN SESSION REQUIRED`. No manual accessibility pass is claimed by automated tooling.
