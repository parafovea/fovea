"""Pytest configuration and shared fixtures for Wikibase loader tests."""

import json
from pathlib import Path
from typing import Any
from unittest.mock import Mock

import pytest


@pytest.fixture
def sample_wikidata_entity() -> dict[str, Any]:
    """Create a sample Wikidata entity for testing."""
    return {
        "type": "item",
        "id": "Q937",
        "labels": {
            "en": {"language": "en", "value": "Albert Einstein"},
            "de": {"language": "de", "value": "Albert Einstein"},
        },
        "descriptions": {
            "en": {
                "language": "en",
                "value": "German-born theoretical physicist (1879-1955)",
            },
        },
        "aliases": {
            "en": [
                {"language": "en", "value": "Einstein"},
                {"language": "en", "value": "A. Einstein"},
            ],
        },
        "claims": {
            "P31": [
                {
                    "mainsnak": {
                        "datavalue": {
                            "type": "wikibase-entityid",
                            "value": {"id": "Q5"},
                        },
                    },
                },
            ],
            "P569": [
                {
                    "mainsnak": {
                        "datavalue": {
                            "type": "time",
                            "value": {
                                "time": "+1879-03-14T00:00:00Z",
                                "precision": 11,
                            },
                        },
                    },
                },
            ],
        },
    }


@pytest.fixture
def sample_entity_list() -> list[str]:
    """Create a sample list of entity IDs for testing."""
    return ["Q5", "Q515", "Q937", "Q60"]


@pytest.fixture
def mock_wikibase_client() -> Mock:
    """Create a mock WikibaseClient."""
    client = Mock()
    client.is_available.return_value = True
    client.login.return_value = None
    client.create_entity.return_value = "Q1"
    client.entity_exists.return_value = False
    return client


@pytest.fixture
def mock_wikidata_response() -> dict[str, Any]:
    """Create a mock Wikidata API response."""
    return {
        "entities": {
            "Q5": {
                "type": "item",
                "id": "Q5",
                "labels": {"en": {"language": "en", "value": "human"}},
                "descriptions": {"en": {"language": "en", "value": "common name of Homo sapiens"}},
            },
        },
    }


@pytest.fixture
def test_data_path() -> Path:
    """Get path to test data directory."""
    return Path(__file__).parent.parent / "test-data"


@pytest.fixture
def unit_test_entities(test_data_path: Path) -> dict[str, Any]:
    """Load unit test entities from JSON file."""
    entities_file = test_data_path / "unit-test-entities.json"
    if entities_file.exists():
        with entities_file.open() as f:
            return json.load(f)
    return {"entities": {}}
