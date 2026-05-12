"""
Test-level conftest: sets DATABASE_URL to a disposable SQLite file BEFORE
any app modules are imported, so the production DB is never touched.
"""
import os
import sys
from pathlib import Path

import pytest

# ── Must run before any import of database.py / main.py ─────────────────────
_TEST_DB = str(Path(__file__).parent / "test_run.db")
os.environ.setdefault("DATABASE_URL", f"sqlite:///{_TEST_DB}")

# Ensure backend/ is on sys.path (supplements the root conftest.py)
_BACKEND = Path(__file__).parent.parent
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))


@pytest.fixture(autouse=True)
def _reset_rate_limits():
    """Reset the analyze-router rate-limit store before every test.

    The TestClient uses 'testclient' as the client IP.  Running 10+
    upload tests in a row exhausts the 10-req/min limit and causes
    subsequent tests to receive 429 instead of their expected 422.
    """
    try:
        from routers.analyze import _reset_rate_store
        _reset_rate_store()
    except Exception:
        pass  # If module not yet loaded, nothing to reset
    yield
