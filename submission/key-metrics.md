# Human-verified key metrics

**Evaluation label:** Small synthetic human-verified evaluation

| Component | Human-verified result |
|---|---:|
| Event precision | 20/20 (100%) |
| Event recall | 11/12 (91.7%, VI/EN full-recall subset) |
| Q↔A linking | 3/3 |
| Context grounding | 51/51 |
| Context citation support | 51/51 |
| Ask answer correctness | 9/9 answered cases |
| Ask citation correctness | 8/9 |
| Unsupported-question abstention | 5/5 |

Across 20 reviewed Event predictions, precision was 100% (20/20). On the explicitly full-recall VI/EN gold subset, recall was 91.7% (11/12), with one missed topic transition. The secondary reviewed precision/recall harmonic F1 is 95.7%; prediction precision and gold recall use different, explicitly reviewed populations.

## Expanded results

- Event type correctness: 20/20
- Event timestamp correctness: 20/20
- Context mean completeness: 1.888889/2
- Context mean usefulness: 1.777778/2
- Ask answer support: 9/9 answered cases
- Ask abstention correctness: 5/6
- Ask supported-question success: 9/10

## Honest error analysis

- Missed Event: `en-topic-serializable`
- Citation weakness: `vi-paraphrase`
- Incorrect abstention: `cs-paraphrase`
- Context redundancy: `cs-topic`
- Context incompleteness: `cs-injection`

Canonical sources: [verified metrics](../evaluation/results/verified_metrics.json) and [final evaluation report](../evaluation/results/final-evaluation-report.md).
