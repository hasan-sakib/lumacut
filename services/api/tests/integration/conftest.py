"""Black-box fixtures: integration tests talk to the running stack over HTTP only."""

from collections.abc import Iterator

import httpx2
import pytest
from api_testkit import API_URL, LoggedIn, register


@pytest.fixture
def api() -> Iterator[httpx2.Client]:
    with httpx2.Client(base_url=API_URL, timeout=30) as client:
        yield client


@pytest.fixture
def user(api: httpx2.Client) -> LoggedIn:
    return register(api)


@pytest.fixture
def other_user() -> Iterator[LoggedIn]:
    with httpx2.Client(base_url=API_URL, timeout=30) as client:
        yield register(client)
