from src.backend.services import queue_service


class _DummyQueue:
    def __init__(self):
        self.calls = []

    def enqueue(self, fn, *args, **kwargs):
        self.calls.append((fn, args, kwargs))


def test_enqueue_pipeline_job_uses_rq_when_available(monkeypatch):
    dummy_queue = _DummyQueue()
    monkeypatch.setattr(queue_service, "_get_rq_queue", lambda: dummy_queue)

    mode = queue_service.enqueue_pipeline_job(video_id="vid-1", video_path="x.mp4")
    assert mode == "rq"
    assert len(dummy_queue.calls) == 1
    _, args, kwargs = dummy_queue.calls[0]
    assert args == ("vid-1", "x.mp4")
    assert kwargs["job_timeout"] == 60 * 60


def test_enqueue_pipeline_job_falls_back_to_background_tasks(monkeypatch):
    monkeypatch.setattr(queue_service, "_get_rq_queue", lambda: None)
    received = {}

    def fake_adder(fn, *args):
        received["fn"] = fn
        received["args"] = args

    mode = queue_service.enqueue_pipeline_job(
        video_id="vid-2",
        video_path="y.mp4",
        fallback_task_adder=fake_adder,
    )
    assert mode == "background_tasks"
    assert received["args"] == ("vid-2", "y.mp4")
