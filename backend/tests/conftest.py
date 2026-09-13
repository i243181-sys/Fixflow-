from __future__ import annotations

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

from backend.main import app
from backend.services import store


@pytest.fixture(autouse=True)
def reset_store() -> Iterator[None]:
    store.reset()
    yield
    store.reset()


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)
