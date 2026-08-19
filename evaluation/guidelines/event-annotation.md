# Event Annotation Guidelines

## Unit and evidence

Annotate against the canonical source transcript. Every event must cite contiguous `source_segment_ids` and use start/end times copied from those segments. Do not infer a timestamp from generated prose.

## Labels

### QUESTION

An utterance that genuinely asks for information or expects a response. Rhetorical discourse markers without an expected response are not questions.

### ANSWER

A direct or clearly relevant explanation that resolves an observed question. A nearby fact is not automatically an answer.

### EXAMPLE

An illustration, case, scenario, calculation, or sample used to explain a concept. Merely saying “for example” without an actual illustration is insufficient.

### TOPIC_CHANGE

A meaningful semantic transition to a new subtopic, method, or stage. Do not label minor phrasing changes or every new sentence.

### IMPORTANT

Use only for explicit emphasis, a core takeaway, repeated importance, or a clear exam cue. Do not label every correct fact as important.

## Precision review

For each predicted event, record `CORRECT`, `PARTIALLY_CORRECT`, or `INCORRECT`:

- `CORRECT`: label, evidence, and span are materially correct.
- `PARTIALLY_CORRECT`: core label is useful but span/evidence or wording is incomplete.
- `INCORRECT`: unsupported label, wrong evidence, or materially wrong meaning.

The acceptance-rate report must state whether partial items count separately. They must not silently become correct.

## Recall subset and matching

Full annotation is required before recall/F1 is reported. `evaluate_events.py` greedily matches predictions to gold events of the same type using the highest temporal score. A match requires interval IoU at least `0.30` or start-time absolute error at most `5.0` seconds. One prediction and one gold event may be used only once.

For matched spans, report mean absolute start error, end error, and their combined mean. Point annotations use start error only.

## Inter-review check

Reviewer A completes the set. Reviewer B reviews a deterministic 20–30% subset and records agree/disagree plus a note. Report simple agreement numerator/denominator only. Do not call it Cohen's Kappa unless the sampling/design supports that statistic.

## Privacy and status

Do not include student names, emails, faces, disability/medical data, or private URLs. An annotation file is gold only when `annotation_status` is `HUMAN_VERIFIED` and reviewer fields identify real team reviewer aliases. `AUTHOR_DRAFT` and `AI_DRAFT` are never model-quality gold.
