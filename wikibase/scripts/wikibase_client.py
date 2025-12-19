"""Wikibase API client for importing entities.

This module provides a client for interacting with the Wikibase MediaWiki API
to create and update entities.
"""

import json
import logging
from dataclasses import dataclass
from http import HTTPStatus
from typing import Any

import requests

from scripts.exceptions import WikibaseImportError

logger = logging.getLogger(__name__)


@dataclass
class WikibaseClient:
    """Client for interacting with a Wikibase instance.

    Parameters
    ----------
    base_url : str
        Base URL of the Wikibase instance (e.g., http://wikibase).
    username : str
        Admin username for authentication.
    password : str
        Admin password for authentication.
    """

    base_url: str
    username: str
    password: str
    _session: requests.Session | None = None
    _csrf_token: str | None = None

    @property
    def api_url(self) -> str:
        """Get the full API URL."""
        return f"{self.base_url}/api.php"

    @property
    def session(self) -> requests.Session:
        """Get or create the requests session."""
        if self._session is None:
            self._session = requests.Session()
        return self._session

    def is_available(self) -> bool:
        """Check if Wikibase is available.

        Returns
        -------
        bool
            True if Wikibase is responding, False otherwise.
        """
        try:
            response = self.session.get(
                self.api_url,
                params={
                    "action": "query",
                    "meta": "siteinfo",
                    "format": "json",
                },
                timeout=10,
            )
            return response.status_code == HTTPStatus.OK
        except requests.RequestException:
            return False

    def login(self) -> None:
        """Authenticate with Wikibase.

        Raises
        ------
        WikibaseImportError
            If login fails.
        """
        # Get login token
        response = self.session.get(
            self.api_url,
            params={
                "action": "query",
                "meta": "tokens",
                "type": "login",
                "format": "json",
            },
            timeout=30,
        )
        response.raise_for_status()
        data = response.json()
        login_token = data["query"]["tokens"]["logintoken"]

        # Perform login
        response = self.session.post(
            self.api_url,
            data={
                "action": "login",
                "lgname": self.username,
                "lgpassword": self.password,
                "lgtoken": login_token,
                "format": "json",
            },
            timeout=30,
        )
        response.raise_for_status()
        data = response.json()

        if data.get("login", {}).get("result") != "Success":
            raise WikibaseImportError(f"Login failed: {data}")

        logger.info("Successfully logged in as %s", self.username)

    def get_csrf_token(self) -> str:
        """Get a CSRF token for editing.

        Returns
        -------
        str
            CSRF token for edit operations.

        Raises
        ------
        WikibaseImportError
            If token retrieval fails.
        """
        if self._csrf_token is not None:
            return self._csrf_token

        response = self.session.get(
            self.api_url,
            params={
                "action": "query",
                "meta": "tokens",
                "format": "json",
            },
            timeout=30,
        )
        response.raise_for_status()
        data: dict[str, Any] = response.json()
        token: str = data["query"]["tokens"]["csrftoken"]
        self._csrf_token = token
        return token

    def create_entity(self, entity_data: dict[str, Any]) -> str:
        """Create a new entity in Wikibase.

        Parameters
        ----------
        entity_data : dict[str, Any]
            Entity data in Wikibase format (labels, descriptions, claims, etc.).

        Returns
        -------
        str
            The ID of the created entity (e.g., 'Q1').

        Raises
        ------
        WikibaseImportError
            If entity creation fails.
        """
        token = self.get_csrf_token()

        response = self.session.post(
            self.api_url,
            data={
                "action": "wbeditentity",
                "new": "item",
                "data": json.dumps(entity_data),
                "token": token,
                "format": "json",
            },
            timeout=60,
        )
        response.raise_for_status()
        data: dict[str, Any] = response.json()

        if "error" in data:
            raise WikibaseImportError(f"Entity creation failed: {data['error']}")

        entity_id: str = data["entity"]["id"]
        logger.debug("Created entity: %s", entity_id)
        return entity_id

    def entity_exists(self, entity_id: str) -> bool:
        """Check if an entity exists in Wikibase.

        Parameters
        ----------
        entity_id : str
            The entity ID to check (e.g., 'Q5').

        Returns
        -------
        bool
            True if the entity exists, False otherwise.
        """
        response = self.session.get(
            self.api_url,
            params={
                "action": "wbgetentities",
                "ids": entity_id,
                "format": "json",
            },
            timeout=30,
        )
        if response.status_code != HTTPStatus.OK:
            return False

        data = response.json()
        entities = data.get("entities", {})
        return entity_id in entities and "missing" not in entities.get(entity_id, {})

    def get_entity(self, entity_id: str) -> dict[str, Any] | None:
        """Get an entity from Wikibase.

        Parameters
        ----------
        entity_id : str
            The entity ID to retrieve (e.g., 'Q5').

        Returns
        -------
        dict[str, Any] | None
            The entity data, or None if not found.
        """
        response = self.session.get(
            self.api_url,
            params={
                "action": "wbgetentities",
                "ids": entity_id,
                "format": "json",
                "props": "labels|descriptions|claims|aliases|sitelinks",
            },
            timeout=30,
        )
        if response.status_code != HTTPStatus.OK:
            return None

        data: dict[str, Any] = response.json()
        entities: dict[str, dict[str, Any]] = data.get("entities", {})
        entity: dict[str, Any] | None = entities.get(entity_id)

        if entity is not None and "missing" not in entity:
            return entity
        return None

    def get_entity_by_sitelink(
        self, site: str, title: str
    ) -> dict[str, Any] | None:
        """Get an entity by its sitelink.

        Parameters
        ----------
        site : str
            The site ID (e.g., 'wikidatawiki').
        title : str
            The page title on that site (e.g., 'Q42').

        Returns
        -------
        dict[str, Any] | None
            The entity data, or None if not found.
        """
        response = self.session.get(
            self.api_url,
            params={
                "action": "wbgetentities",
                "sites": site,
                "titles": title,
                "format": "json",
                "props": "labels|descriptions|claims|aliases|sitelinks",
            },
            timeout=30,
        )
        if response.status_code != HTTPStatus.OK:
            return None

        data: dict[str, Any] = response.json()
        entities: dict[str, dict[str, Any]] = data.get("entities", {})

        # Return the first non-missing entity
        for entity in entities.values():
            if "missing" not in entity:
                return entity
        return None

    def get_local_id_for_wikidata(self, wikidata_id: str) -> str | None:
        """Get the local entity ID for a Wikidata Q ID.

        Uses the wikidatawiki sitelink to find the local entity.

        Parameters
        ----------
        wikidata_id : str
            The Wikidata entity ID (e.g., 'Q42').

        Returns
        -------
        str | None
            The local entity ID, or None if not found.
        """
        entity = self.get_entity_by_sitelink("wikidatawiki", wikidata_id)
        if entity is not None:
            local_id: str = entity.get("id", "")
            return local_id if local_id else None
        return None
