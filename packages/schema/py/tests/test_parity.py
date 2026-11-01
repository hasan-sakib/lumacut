"""TS <-> Python parity: the generated Pydantic models must agree with Zod on every fixture.

The same fixture files are checked by packages/schema/test/fixtures.test.ts (Zod). Here every
valid case must validate and round-trip losslessly, and every invalid case must be rejected.
"""

import json
from pathlib import Path
from typing import Any

import pytest
from pydantic import ValidationError

from lumacut_schema import dump_json, parse_op_json, parse_project_json

FIXTURES = Path(__file__).resolve().parents[2] / "fixtures"


def load(validity: str, kind: str) -> list[Any]:
    cases: list[Any] = []
    for path in sorted((FIXTURES / validity / kind).glob("*.json")):
        for case in json.loads(path.read_text()):
            cases.append(pytest.param(case["value"], id=f"{path.stem}: {case['name']}"))
    return cases


PARSERS = {"project": parse_project_json, "op": parse_op_json}


@pytest.mark.parametrize("value", load("valid", "project"))
def test_valid_project_round_trips(value: Any) -> None:
    parsed = parse_project_json(json.dumps(value))
    assert json.loads(dump_json(parsed)) == value


@pytest.mark.parametrize("value", load("valid", "op"))
def test_valid_op_round_trips(value: Any) -> None:
    parsed = parse_op_json(json.dumps(value))
    assert json.loads(dump_json(parsed)) == value


@pytest.mark.parametrize("value", load("invalid", "project"))
def test_invalid_project_rejected(value: Any) -> None:
    with pytest.raises(ValidationError):
        parse_project_json(json.dumps(value))


@pytest.mark.parametrize("value", load("invalid", "op"))
def test_invalid_op_rejected(value: Any) -> None:
    with pytest.raises(ValidationError):
        parse_op_json(json.dumps(value))


def test_fixture_sets_are_not_empty() -> None:
    for validity in ("valid", "invalid"):
        for kind in PARSERS:
            assert load(validity, kind), f"no {validity} {kind} fixtures"
