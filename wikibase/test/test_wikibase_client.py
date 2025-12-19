"""Tests for the WikibaseClient class.

This module provides comprehensive tests for the Wikibase API client.
"""

from http import HTTPStatus
from unittest.mock import Mock, patch

import pytest
import requests

from scripts.exceptions import WikibaseImportError
from scripts.wikibase_client import WikibaseClient


@pytest.fixture
def wikibase_client() -> WikibaseClient:
    """Create a WikibaseClient instance for testing."""
    return WikibaseClient(
        base_url="http://wikibase:8181",
        username="Admin",
        password="adminpassword",  # noqa: S106
    )


class TestWikibaseClientInit:
    """Tests for WikibaseClient initialization."""

    def test_api_url(self, wikibase_client: WikibaseClient) -> None:
        """Test that API URL is correctly formed."""
        assert wikibase_client.api_url == "http://wikibase:8181/api.php"

    def test_session_created_on_access(self, wikibase_client: WikibaseClient) -> None:
        """Test that session is lazily created."""
        assert wikibase_client._session is None
        session = wikibase_client.session
        assert session is not None
        assert wikibase_client._session is session

    def test_session_reused(self, wikibase_client: WikibaseClient) -> None:
        """Test that session is reused on subsequent accesses."""
        session1 = wikibase_client.session
        session2 = wikibase_client.session
        assert session1 is session2


class TestIsAvailable:
    """Tests for the is_available method."""

    def test_returns_true_when_available(self, wikibase_client: WikibaseClient) -> None:
        """Test that is_available returns True when Wikibase responds."""
        mock_response = Mock()
        mock_response.status_code = HTTPStatus.OK

        with patch.object(wikibase_client.session, "get", return_value=mock_response):
            assert wikibase_client.is_available() is True

    def test_returns_false_when_unavailable(self, wikibase_client: WikibaseClient) -> None:
        """Test that is_available returns False when Wikibase doesn't respond."""
        mock_response = Mock()
        mock_response.status_code = HTTPStatus.SERVICE_UNAVAILABLE

        with patch.object(wikibase_client.session, "get", return_value=mock_response):
            assert wikibase_client.is_available() is False

    def test_returns_false_on_network_error(self, wikibase_client: WikibaseClient) -> None:
        """Test that is_available returns False on network errors."""
        with patch.object(
            wikibase_client.session,
            "get",
            side_effect=requests.RequestException("Connection refused"),
        ):
            assert wikibase_client.is_available() is False


class TestLogin:
    """Tests for the login method."""

    def test_login_success(self, wikibase_client: WikibaseClient) -> None:
        """Test successful login."""
        token_response = Mock()
        token_response.raise_for_status = Mock()
        token_response.json.return_value = {
            "query": {"tokens": {"logintoken": "test_token"}}
        }

        login_response = Mock()
        login_response.raise_for_status = Mock()
        login_response.json.return_value = {"login": {"result": "Success"}}

        with patch.object(
            wikibase_client.session, "get", return_value=token_response
        ), patch.object(wikibase_client.session, "post", return_value=login_response):
            wikibase_client.login()

    def test_login_invalid_credentials(self, wikibase_client: WikibaseClient) -> None:
        """Test login with invalid credentials."""
        token_response = Mock()
        token_response.raise_for_status = Mock()
        token_response.json.return_value = {
            "query": {"tokens": {"logintoken": "test_token"}}
        }

        login_response = Mock()
        login_response.raise_for_status = Mock()
        login_response.json.return_value = {"login": {"result": "Failed"}}

        with patch.object(
            wikibase_client.session, "get", return_value=token_response
        ), patch.object(
            wikibase_client.session, "post", return_value=login_response
        ), pytest.raises(WikibaseImportError, match="Login failed"):
            wikibase_client.login()

    def test_login_network_error(self, wikibase_client: WikibaseClient) -> None:
        """Test login with network error."""
        with patch.object(
            wikibase_client.session,
            "get",
            side_effect=requests.HTTPError("Connection refused"),
        ), pytest.raises(requests.HTTPError):
            wikibase_client.login()


class TestGetCsrfToken:
    """Tests for the get_csrf_token method."""

    def test_get_csrf_token_success(self, wikibase_client: WikibaseClient) -> None:
        """Test successful CSRF token retrieval."""
        mock_response = Mock()
        mock_response.raise_for_status = Mock()
        mock_response.json.return_value = {
            "query": {"tokens": {"csrftoken": "test_csrf_token"}}
        }

        with patch.object(wikibase_client.session, "get", return_value=mock_response):
            token = wikibase_client.get_csrf_token()
            assert token == "test_csrf_token"  # noqa: S105

    def test_get_csrf_token_cached(self, wikibase_client: WikibaseClient) -> None:
        """Test that CSRF token is cached after first retrieval."""
        mock_response = Mock()
        mock_response.raise_for_status = Mock()
        mock_response.json.return_value = {
            "query": {"tokens": {"csrftoken": "cached_token"}}
        }

        with patch.object(wikibase_client.session, "get", return_value=mock_response):
            token1 = wikibase_client.get_csrf_token()
            token2 = wikibase_client.get_csrf_token()

            assert token1 == token2
            # Should only be called once due to caching
            wikibase_client.session.get.assert_called_once()


class TestCreateEntity:
    """Tests for the create_entity method."""

    def test_create_entity_success(self, wikibase_client: WikibaseClient) -> None:
        """Test successful entity creation."""
        wikibase_client._csrf_token = "test_token"  # noqa: S105

        mock_response = Mock()
        mock_response.raise_for_status = Mock()
        mock_response.json.return_value = {"entity": {"id": "Q1"}}

        with patch.object(wikibase_client.session, "post", return_value=mock_response):
            entity_id = wikibase_client.create_entity(
                {"labels": {"en": {"language": "en", "value": "Test"}}}
            )
            assert entity_id == "Q1"

    def test_create_entity_with_labels(self, wikibase_client: WikibaseClient) -> None:
        """Test entity creation with labels."""
        wikibase_client._csrf_token = "test_token"  # noqa: S105

        mock_response = Mock()
        mock_response.raise_for_status = Mock()
        mock_response.json.return_value = {"entity": {"id": "Q2"}}

        entity_data = {
            "labels": {
                "en": {"language": "en", "value": "Test Entity"},
                "de": {"language": "de", "value": "Testentität"},
            }
        }

        with patch.object(wikibase_client.session, "post", return_value=mock_response):
            entity_id = wikibase_client.create_entity(entity_data)
            assert entity_id == "Q2"

    def test_create_entity_with_descriptions(self, wikibase_client: WikibaseClient) -> None:
        """Test entity creation with descriptions."""
        wikibase_client._csrf_token = "test_token"  # noqa: S105

        mock_response = Mock()
        mock_response.raise_for_status = Mock()
        mock_response.json.return_value = {"entity": {"id": "Q3"}}

        entity_data = {
            "labels": {"en": {"language": "en", "value": "Test"}},
            "descriptions": {"en": {"language": "en", "value": "A test entity"}},
        }

        with patch.object(wikibase_client.session, "post", return_value=mock_response):
            entity_id = wikibase_client.create_entity(entity_data)
            assert entity_id == "Q3"

    def test_create_entity_error_response(self, wikibase_client: WikibaseClient) -> None:
        """Test entity creation with error response."""
        wikibase_client._csrf_token = "test_token"  # noqa: S105

        mock_response = Mock()
        mock_response.raise_for_status = Mock()
        mock_response.json.return_value = {"error": {"code": "failed", "info": "Error"}}

        with patch.object(
            wikibase_client.session, "post", return_value=mock_response
        ), pytest.raises(WikibaseImportError, match="Entity creation failed"):
            wikibase_client.create_entity({"labels": {}})


class TestEntityExists:
    """Tests for the entity_exists method."""

    def test_entity_exists_true(self, wikibase_client: WikibaseClient) -> None:
        """Test that entity_exists returns True for existing entity."""
        mock_response = Mock()
        mock_response.status_code = HTTPStatus.OK
        mock_response.json.return_value = {
            "entities": {
                "Q5": {
                    "id": "Q5",
                    "type": "item",
                    "labels": {"en": {"value": "human"}},
                }
            }
        }

        with patch.object(wikibase_client.session, "get", return_value=mock_response):
            assert wikibase_client.entity_exists("Q5") is True

    def test_entity_exists_false(self, wikibase_client: WikibaseClient) -> None:
        """Test that entity_exists returns False for missing entity."""
        mock_response = Mock()
        mock_response.status_code = HTTPStatus.OK
        mock_response.json.return_value = {
            "entities": {"Q999": {"id": "Q999", "missing": ""}}
        }

        with patch.object(wikibase_client.session, "get", return_value=mock_response):
            assert wikibase_client.entity_exists("Q999") is False

    def test_entity_exists_http_error(self, wikibase_client: WikibaseClient) -> None:
        """Test that entity_exists returns False on HTTP error."""
        mock_response = Mock()
        mock_response.status_code = HTTPStatus.NOT_FOUND

        with patch.object(wikibase_client.session, "get", return_value=mock_response):
            assert wikibase_client.entity_exists("Q5") is False


class TestGetEntity:
    """Tests for the get_entity method."""

    def test_get_entity_success(self, wikibase_client: WikibaseClient) -> None:
        """Test successful entity retrieval."""
        entity_data = {
            "id": "Q42",
            "type": "item",
            "labels": {"en": {"value": "Douglas Adams"}},
        }
        mock_response = Mock()
        mock_response.status_code = HTTPStatus.OK
        mock_response.json.return_value = {"entities": {"Q42": entity_data}}

        with patch.object(wikibase_client.session, "get", return_value=mock_response):
            result = wikibase_client.get_entity("Q42")
            assert result == entity_data

    def test_get_entity_not_found(self, wikibase_client: WikibaseClient) -> None:
        """Test entity retrieval for non-existent entity."""
        mock_response = Mock()
        mock_response.status_code = HTTPStatus.OK
        mock_response.json.return_value = {
            "entities": {"Q999": {"id": "Q999", "missing": ""}}
        }

        with patch.object(wikibase_client.session, "get", return_value=mock_response):
            result = wikibase_client.get_entity("Q999")
            assert result is None

    def test_get_entity_http_error(self, wikibase_client: WikibaseClient) -> None:
        """Test entity retrieval on HTTP error."""
        mock_response = Mock()
        mock_response.status_code = HTTPStatus.INTERNAL_SERVER_ERROR

        with patch.object(wikibase_client.session, "get", return_value=mock_response):
            result = wikibase_client.get_entity("Q42")
            assert result is None


class TestGetEntityBySitelink:
    """Tests for the get_entity_by_sitelink method."""

    def test_get_entity_by_sitelink_found(self, wikibase_client: WikibaseClient) -> None:
        """Test finding entity by sitelink."""
        entity_data = {
            "id": "Q1",
            "type": "item",
            "labels": {"en": {"value": "Test"}},
            "sitelinks": {"wikidatawiki": {"title": "Q42"}},
        }
        mock_response = Mock()
        mock_response.status_code = HTTPStatus.OK
        mock_response.json.return_value = {"entities": {"Q1": entity_data}}

        with patch.object(wikibase_client.session, "get", return_value=mock_response):
            result = wikibase_client.get_entity_by_sitelink("wikidatawiki", "Q42")
            assert result == entity_data

    def test_get_entity_by_sitelink_not_found(self, wikibase_client: WikibaseClient) -> None:
        """Test sitelink lookup for non-existent entity."""
        mock_response = Mock()
        mock_response.status_code = HTTPStatus.OK
        mock_response.json.return_value = {
            "entities": {"-1": {"id": "-1", "missing": ""}}
        }

        with patch.object(wikibase_client.session, "get", return_value=mock_response):
            result = wikibase_client.get_entity_by_sitelink("wikidatawiki", "Q999999")
            assert result is None


class TestGetLocalIdForWikidata:
    """Tests for the get_local_id_for_wikidata method."""

    def test_get_local_id_for_wikidata_found(
        self, wikibase_client: WikibaseClient
    ) -> None:
        """Test finding local ID for Wikidata ID."""
        mock_response = Mock()
        mock_response.status_code = HTTPStatus.OK
        mock_response.json.return_value = {
            "entities": {
                "Q1": {
                    "id": "Q1",
                    "type": "item",
                    "sitelinks": {"wikidatawiki": {"title": "Q42"}},
                }
            }
        }

        with patch.object(wikibase_client.session, "get", return_value=mock_response):
            result = wikibase_client.get_local_id_for_wikidata("Q42")
            assert result == "Q1"

    def test_get_local_id_for_wikidata_not_found(
        self, wikibase_client: WikibaseClient
    ) -> None:
        """Test local ID lookup for non-existent Wikidata ID."""
        mock_response = Mock()
        mock_response.status_code = HTTPStatus.OK
        mock_response.json.return_value = {
            "entities": {"-1": {"id": "-1", "missing": ""}}
        }

        with patch.object(wikibase_client.session, "get", return_value=mock_response):
            result = wikibase_client.get_local_id_for_wikidata("Q999999")
            assert result is None
