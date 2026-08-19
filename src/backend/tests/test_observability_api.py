from fastapi.testclient import TestClient

from src.backend.main import app


def test_health_and_metrics_endpoints_are_available():
    client = TestClient(app)

    health_res = client.get("/api/health")
    assert health_res.status_code == 200
    assert health_res.json()["status"] == "healthy"

    deep_res = client.get("/api/health/deep")
    assert deep_res.status_code == 200
    deep_body = deep_res.json()
    assert "status" in deep_body
    assert "checks" in deep_body
    assert "database" in deep_body["checks"]

    metrics_res = client.get("/api/metrics")
    assert metrics_res.status_code == 200
    metrics = metrics_res.json()
    assert metrics["request_count"] >= 2
    assert "average_duration_ms" in metrics
