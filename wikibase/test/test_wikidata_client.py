"""Tests for the WikidataClient class.

This module provides comprehensive tests for the Wikidata API client.
"""

from typing import Any
from unittest.mock import Mock, patch

import pytest
import requests

from scripts.exceptions import WikidataFetchError
from scripts.wikidata_client import WikidataClient


@pytest.fixture
def wikidata_client() -> WikidataClient:
    """Create a WikidataClient instance for testing."""
    return WikidataClient(batch_size=50)


class TestWikidataClientInit:
    """Tests for WikidataClient initialization."""

    def test_default_batch_size(self) -> None:
        """Test default batch size."""
        client = WikidataClient()
        assert client.batch_size == 50

    def test_custom_batch_size(self) -> None:
        """Test custom batch size."""
        client = WikidataClient(batch_size=20)
        assert client.batch_size == 20

    def test_session_created_on_access(self, wikidata_client: WikidataClient) -> None:
        """Test that session is lazily created."""
        assert wikidata_client._session is None
        session = wikidata_client.session
        assert session is not None

    def test_session_has_user_agent(self, wikidata_client: WikidataClient) -> None:
        """Test that session has User-Agent header."""
        session = wikidata_client.session
        assert "User-Agent" in session.headers
        assert "FOVEA-Wikibase-Loader" in session.headers["User-Agent"]


class TestFetchEntity:
    """Tests for the fetch_entity method."""

    def test_fetch_entity_success(self, wikidata_client: WikidataClient) -> None:
        """Test successful single entity fetch."""
        entity_data = {
            "id": "Q5",
            "type": "item",
            "labels": {"en": {"value": "human"}},
        }
        mock_response = Mock()
        mock_response.raise_for_status = Mock()
        mock_response.json.return_value = {"entities": {"Q5": entity_data}}

        with patch.object(wikidata_client.session, "get", return_value=mock_response):
            result = wikidata_client.fetch_entity("Q5")
            assert result == entity_data

    def test_fetch_entity_not_found(self, wikidata_client: WikidataClient) -> None:
        """Test fetch for non-existent entity."""
        mock_response = Mock()
        mock_response.raise_for_status = Mock()
        mock_response.json.return_value = {
            "entities": {"Q999999": {"id": "Q999999", "missing": ""}}
        }

        with patch.object(wikidata_client.session, "get", return_value=mock_response):
            result = wikidata_client.fetch_entity("Q999999")
            assert result is None

    def test_fetch_entity_network_error(self, wikidata_client: WikidataClient) -> None:
        """Test fetch with network error."""
        with patch.object(
            wikidata_client.session,
            "get",
            side_effect=requests.RequestException("Connection failed"),
        ), pytest.raises(WikidataFetchError, match="Failed to fetch entity Q5"):
            wikidata_client.fetch_entity("Q5")


class TestFetchEntities:
    """Tests for the fetch_entities method."""

    def test_fetch_entities_single(self, wikidata_client: WikidataClient) -> None:
        """Test fetching a single entity."""
        entity_data = {"id": "Q5", "type": "item", "labels": {"en": {"value": "human"}}}
        mock_response = Mock()
        mock_response.raise_for_status = Mock()
        mock_response.json.return_value = {"entities": {"Q5": entity_data}}

        with patch.object(wikidata_client.session, "get", return_value=mock_response):
            result = wikidata_client.fetch_entities(["Q5"], show_progress=False)
            assert "Q5" in result
            assert result["Q5"] == entity_data

    def test_fetch_entities_batch(self, wikidata_client: WikidataClient) -> None:
        """Test batching for multiple entities."""
        wikidata_client.batch_size = 2  # Small batch for testing

        entities_batch1 = {
            "Q1": {"id": "Q1", "type": "item"},
            "Q2": {"id": "Q2", "type": "item"},
        }
        entities_batch2 = {
            "Q3": {"id": "Q3", "type": "item"},
        }

        mock_responses = [
            Mock(json=Mock(return_value={"entities": entities_batch1})),
            Mock(json=Mock(return_value={"entities": entities_batch2})),
        ]
        for resp in mock_responses:
            resp.raise_for_status = Mock()

        with patch.object(
            wikidata_client.session, "get", side_effect=mock_responses
        ):
            result = wikidata_client.fetch_entities(
                ["Q1", "Q2", "Q3"], show_progress=False
            )
            assert len(result) == 3
            assert "Q1" in result
            assert "Q2" in result
            assert "Q3" in result

    def test_fetch_entities_exceeds_batch_size(
        self, wikidata_client: WikidataClient
    ) -> None:
        """Test that entities exceeding batch size are correctly batched."""
        wikidata_client.batch_size = 2

        # Create entity data for 5 entities (3 batches with sizes 2, 2, 1)
        all_entities: dict[str, dict[str, Any]] = {}
        for i in range(1, 6):
            all_entities[f"Q{i}"] = {"id": f"Q{i}", "type": "item"}

        # Create responses for each batch
        responses = [
            Mock(json=Mock(return_value={"entities": {f"Q{i}": all_entities[f"Q{i}"] for i in [1, 2]}})),
            Mock(json=Mock(return_value={"entities": {f"Q{i}": all_entities[f"Q{i}"] for i in [3, 4]}})),
            Mock(json=Mock(return_value={"entities": {"Q5": all_entities["Q5"]}})),
        ]
        for resp in responses:
            resp.raise_for_status = Mock()

        with patch.object(wikidata_client.session, "get", side_effect=responses):
            result = wikidata_client.fetch_entities(
                ["Q1", "Q2", "Q3", "Q4", "Q5"], show_progress=False
            )
            assert len(result) == 5

    def test_fetch_entities_partial_success(
        self, wikidata_client: WikidataClient
    ) -> None:
        """Test that batch failures don't fail entire operation."""
        wikidata_client.batch_size = 2

        success_response = Mock()
        success_response.raise_for_status = Mock()
        success_response.json.return_value = {
            "entities": {"Q1": {"id": "Q1", "type": "item"}}
        }

        fail_response = Mock()
        fail_response.raise_for_status.side_effect = requests.RequestException("Failed")

        with patch.object(
            wikidata_client.session,
            "get",
            side_effect=[success_response, fail_response],
        ):
            result = wikidata_client.fetch_entities(
                ["Q1", "Q2", "Q3", "Q4"], show_progress=False
            )
            # First batch succeeds, second fails but operation continues
            assert "Q1" in result

    def test_fetch_entities_empty_list(self, wikidata_client: WikidataClient) -> None:
        """Test fetching with empty list."""
        result = wikidata_client.fetch_entities([], show_progress=False)
        assert result == {}

    def test_fetch_entities_filters_missing(
        self, wikidata_client: WikidataClient
    ) -> None:
        """Test that missing entities are filtered from results."""
        mock_response = Mock()
        mock_response.raise_for_status = Mock()
        mock_response.json.return_value = {
            "entities": {
                "Q1": {"id": "Q1", "type": "item"},
                "Q999": {"id": "Q999", "missing": ""},
            }
        }

        with patch.object(wikidata_client.session, "get", return_value=mock_response):
            result = wikidata_client.fetch_entities(["Q1", "Q999"], show_progress=False)
            assert "Q1" in result
            assert "Q999" not in result


class TestGetRelatedEntities:
    """Tests for the get_related_entities method."""

    def test_get_related_entities_from_claims(
        self, wikidata_client: WikidataClient
    ) -> None:
        """Test extracting related entities from claims."""
        entity = {
            "id": "Q937",
            "claims": {
                "P31": [
                    {
                        "mainsnak": {
                            "datavalue": {"type": "wikibase-entityid", "value": {"id": "Q5"}}
                        }
                    }
                ],
                "P27": [
                    {
                        "mainsnak": {
                            "datavalue": {
                                "type": "wikibase-entityid",
                                "value": {"id": "Q183"},
                            }
                        }
                    }
                ],
            },
        }

        related = wikidata_client.get_related_entities(entity, max_depth=1)
        assert "Q5" in related
        assert "Q183" in related

    def test_get_related_entities_from_qualifiers(
        self, wikidata_client: WikidataClient
    ) -> None:
        """Test extracting related entities from qualifiers."""
        entity = {
            "id": "Q937",
            "claims": {
                "P39": [
                    {
                        "mainsnak": {
                            "datavalue": {"type": "wikibase-entityid", "value": {"id": "Q1"}}
                        },
                        "qualifiers": {
                            "P580": [
                                {
                                    "datavalue": {
                                        "type": "wikibase-entityid",
                                        "value": {"id": "Q2"},
                                    }
                                }
                            ]
                        },
                    }
                ],
            },
        }

        related = wikidata_client.get_related_entities(entity, max_depth=1)
        assert "Q1" in related
        assert "Q2" in related

    def test_get_related_entities_empty(self, wikidata_client: WikidataClient) -> None:
        """Test extracting from entity with no claims."""
        entity = {"id": "Q1", "claims": {}}
        related = wikidata_client.get_related_entities(entity, max_depth=1)
        assert len(related) == 0

    def test_get_related_entities_no_claims(
        self, wikidata_client: WikidataClient
    ) -> None:
        """Test extracting from entity without claims key."""
        entity = {"id": "Q1"}
        related = wikidata_client.get_related_entities(entity, max_depth=1)
        assert len(related) == 0

    def test_get_related_entities_max_depth_zero(
        self, wikidata_client: WikidataClient
    ) -> None:
        """Test that max_depth=0 returns empty set."""
        entity = {
            "id": "Q1",
            "claims": {
                "P31": [
                    {
                        "mainsnak": {
                            "datavalue": {"type": "wikibase-entityid", "value": {"id": "Q5"}}
                        }
                    }
                ],
            },
        }
        related = wikidata_client.get_related_entities(entity, max_depth=0)
        assert len(related) == 0

    def test_get_related_entities_ignores_non_entity_values(
        self, wikidata_client: WikidataClient
    ) -> None:
        """Test that non-entity datavalues are ignored."""
        entity = {
            "id": "Q937",
            "claims": {
                "P569": [
                    {
                        "mainsnak": {
                            "datavalue": {
                                "type": "time",
                                "value": {"time": "+1879-03-14T00:00:00Z"},
                            }
                        }
                    }
                ],
                "P18": [
                    {
                        "mainsnak": {
                            "datavalue": {"type": "string", "value": "Einstein.jpg"}
                        }
                    }
                ],
            },
        }

        related = wikidata_client.get_related_entities(entity, max_depth=1)
        assert len(related) == 0

    def test_get_related_entities_handles_missing_id(
        self, wikidata_client: WikidataClient
    ) -> None:
        """Test handling of entityid values without id field."""
        entity = {
            "id": "Q1",
            "claims": {
                "P31": [
                    {
                        "mainsnak": {
                            "datavalue": {
                                "type": "wikibase-entityid",
                                "value": {},  # No id field
                            }
                        }
                    }
                ],
            },
        }

        related = wikidata_client.get_related_entities(entity, max_depth=1)
        assert len(related) == 0
