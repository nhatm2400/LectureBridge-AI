# Verified metrics

Status: **HUMAN_VERIFIED**

Final model: `gemini-3.5-flash-lite`

AI-assisted review suggestions were generated against canonical source evidence and subsequently manually verified by one human reviewer.

## Metrics

- events: `{"prediction_precision": {"reviewed_prediction_count": 20, "true_positive_predictions": 20, "false_positive_predictions": 0, "partially_correct_predictions": 0, "strict_precision": 1.0, "type_correct_count": 20, "type_correctness": 1.0, "timestamp_correct_count": 20, "timestamp_correctness": 1.0}, "gold_recall": {"full_recall_gold_count": 12, "true_positive_gold_matches": 11, "false_negative_gold_events": 1, "recall": 0.916667, "missing_event_ids": ["en-topic-serializable"]}, "reviewed_precision_recall_f1": 0.956522, "f1_definition": "Harmonic mean of strict prediction precision over all 20 reviewed predictions and gold recall over the explicitly full-recall VI/EN subset.", "population_note": "Prediction precision and gold recall use separately reviewed denominators; valid predictions outside the full-recall subset are not treated as false positives."}`
- question_answer_links: `{"question_count": 3, "correct_links": 3, "incorrect_links": 0, "link_accuracy": 1.0, "link": {"tp": 3, "fp": 0, "fn": 0, "precision": 1.0, "recall": 1.0, "f1": 1.0}, "corrected_link_count": 0, "no_answer_case_count": 0, "no_answer_correct_count": 0, "no_answer_accuracy": null}`
- context_recovery: `{"window_count": 9, "claim_count": 51, "grounded_claim_count": 51, "grounded_claim_rate": 1.0, "citation_supported_claim_count": 51, "citation_supported_claim_rate": 1.0, "unsupported_claim_count": 0, "unsupported_claim_rate": 0.0, "unsupported_response_count": 0, "completeness_distribution": {"0": 0, "1": 1, "2": 8}, "mean_completeness_score": 1.888889, "usefulness_distribution": {"0": 0, "1": 2, "2": 7}, "mean_usefulness_score": 1.777778, "confirmed_lower_quality_cases": {"cs-topic": {"completeness": 2, "usefulness": 1}, "cs-injection": {"completeness": 1, "usefulness": 1}}}`
- grounded_ask: `{"question_count": 15, "supported_question_count": 10, "unsupported_question_count": 5, "answered_question_count": 9, "answer_correct_count": 9, "answer_correctness": 1.0, "answer_supported_count": 9, "answer_support_rate": 1.0, "citation_correct_count": 8, "citation_reviewed_answer_count": 9, "citation_correctness": 0.888889, "unsupported_claim_count": 0, "unsupported_claim_rate": 0.0, "abstention_count": 6, "correct_abstention_count": 5, "abstention_correctness": 0.833333, "supported_question_success_count": 9, "supported_question_success_rate": 0.9, "unsupported_question_abstention_count": 5, "unsupported_question_abstention_accuracy": 1.0, "confirmed_error_cases": {"vi-paraphrase": "Answer correct and supported; citation incorrect.", "cs-paraphrase": "Model abstained despite sufficient lecture evidence."}}`

## Blockers

- None

This evaluation uses one human reviewer. Therefore, no inter-rater agreement or independent secondary-review reliability measure is reported.

These synthetic small-set results are not a claim of statistical significance or universal effectiveness.
