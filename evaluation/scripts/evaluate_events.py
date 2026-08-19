import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from evaluation.scripts.metrics import evaluate_events


def main() -> int:
    parser = argparse.ArgumentParser(description="Evaluate LectureBridge event predictions against human-verified gold.")
    parser.add_argument("--gold", type=Path, required=True)
    parser.add_argument("--predictions", type=Path, required=True)
    parser.add_argument("--iou-threshold", type=float, default=0.30)
    parser.add_argument("--start-tolerance-seconds", type=float, default=5.0)
    args = parser.parse_args()
    gold = json.loads(args.gold.read_text(encoding="utf-8"))
    if gold.get("annotation_status") != "HUMAN_VERIFIED":
        raise SystemExit("Refusing model-quality metrics: gold annotation_status is not HUMAN_VERIFIED.")
    predictions = json.loads(args.predictions.read_text(encoding="utf-8"))
    result = evaluate_events(
        gold,
        predictions,
        iou_threshold=args.iou_threshold,
        start_tolerance_seconds=args.start_tolerance_seconds,
    )
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
