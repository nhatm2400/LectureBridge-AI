# LectureBridge AI — 2-minute demo script

This is the canonical presenter script for the project-authored synthetic demo lecture. Keep API keys, local paths, private data, logs, and developer tools out of frame.

## 0:00–0:15 — The problem

**On screen:** A long caption transcript beside the lecture player.

**Presenter:** “Captions make speech visible, but words alone do not always recover the structure of a lecture. If I miss a moment, I still need to find the question, the answer, the example, and why that part mattered.”

## 0:15–0:35 — Access the lecture

**On screen:** Open the synthetic lecture, play a few seconds, then move through the timestamped transcript.

**Presenter:** “LectureBridge keeps the video and timestamped transcript together. It supports Vietnamese, English, and code-switch content, and every transcript line can take me back to the exact moment in the lecture.”

## 0:35–0:55 — Semantic Timeline

**On screen:** Select `TOPIC_CHANGE → QUESTION → ANSWER → EXAMPLE → IMPORTANT`; open the Q↔A relation and seek once.

**Presenter:** “Lecture Intelligence turns the full transcript into a Semantic Timeline. I can see when the topic changes, where a question appears, which later event answers it, and where the lecturer gives an example or an important takeaway.”

## 0:55–1:15 — Context Recovery

**On screen:** Activate “I missed this part — what happened?” and open one cited result.

**Presenter:** “If my attention moved away, Context Recovery summarizes the recent window instead of making me search the whole transcript. Each claim stays connected to validated lecture evidence, and the timestamp comes from the backend—not from the model.”

## 1:15–1:35 — Grounded Ask

**On screen:** Ask a supported question, reveal its citation, and jump to the evidence.

**Presenter:** “Now I can ask about the current lecture. LectureBridge retrieves relevant source segments, answers from that evidence, and lets me jump directly to the cited moment. The same evidence graph can support summaries, highlights, flashcards, and quizzes.”

## 1:35–1:50 — Responsible AI

**On screen:** Ask an unsupported question and show the abstention state.

**Presenter:** “When the lecture does not support a question, the safer response is to say so. Source-ID validation, bounded evidence, abstention, and human review make the system's limits visible.”

## 1:50–2:00 — Impact and verified evaluation

**On screen:** Show the compact human-verified results table and the “small synthetic evaluation” label.

**Presenter:** “In our small human-verified synthetic evaluation, all 20 reviewed Event predictions were correct, while the full-recall VI/EN subset matched 11 of 12 gold Events. LectureBridge is measured honestly—including the misses—so we can improve without hiding uncertainty.”

## Recording notes

- Use only the synthetic lecture identified in `demo/demo-manifest.json`.
- Keep the “small synthetic human-verified evaluation” label visible with metrics.
- Do not claim statistical significance or universal accessibility effectiveness.
- Do not show `.env`, credentials, email addresses, private URLs, logs, database content, or local filesystem paths.
