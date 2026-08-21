"""HTTP integration tests tối thiểu cho FastAPI demo V119/V120."""

import sys
from pathlib import Path

project_root = Path(__file__).resolve().parent.parent
if str(project_root) not in sys.path:
    sys.path.insert(0, str(project_root))

from fastapi.testclient import TestClient
from app_server import app


def _assert_ok(response, label):
    assert response.status_code == 200, f"{label}: HTTP {response.status_code} - {response.text}"
    return response.json()


def run_http_api_tests():
    print("=" * 70)
    print("HTTP INTEGRATION TESTS - FASTAPI TESTCLIENT")
    print("=" * 70)

    with TestClient(app) as client:
        meta = _assert_ok(client.get("/api/meta"), "GET /api/meta")
        max_date = meta["max_date"]

        overview = _assert_ok(
            client.get("/api/overview", params={"date": max_date}),
            "GET /api/overview",
        )
        assert "kpi_cards" in overview

        containers = _assert_ok(
            client.get(
                "/api/containers",
                params={"date": max_date, "filter_type": "current", "limit": 20},
            ),
            "GET /api/containers",
        )
        assert "data" in containers

        benchmark = _assert_ok(
            client.get("/api/benchmark/run", params={"rows": 1000}),
            "GET /api/benchmark/run",
        )
        assert benchmark["metrics"]["benchmark_scope"].startswith("DuckDB CSV vs DuckDB Parquet")

        etl = _assert_ok(
            client.post("/api/etl/run", data={"source_type": "demo"}),
            "POST /api/etl/run",
        )
        assert etl["total_rows"] >= 204
        assert etl["error_rows"] >= 4

        upload_csv_path = project_root / "data" / "etl_input" / "container_etl_demo.csv"
        with upload_csv_path.open("rb") as upload_file:
            etl_upload = _assert_ok(
                client.post(
                    "/api/etl/run",
                    data={"source_type": "upload"},
                    files={"file": (upload_csv_path.name, upload_file, "text/csv")},
                ),
                "POST /api/etl/run multipart upload",
            )
        assert etl_upload["total_rows"] >= 204
        assert etl_upload["error_rows"] >= 4

    print("[PASS] 6 HTTP integration tests")
    return True


if __name__ == "__main__":
    run_http_api_tests()
