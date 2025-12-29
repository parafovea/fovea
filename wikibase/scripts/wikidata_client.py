"""Wikidata API client for fetching entities.

This module provides a client for fetching entity data from the public
Wikidata API.
"""

import logging
from dataclasses import dataclass, field
from typing import Any

import requests
from tqdm import tqdm

from scripts.exceptions import WikidataFetchError

logger = logging.getLogger(__name__)

WIKIDATA_API = "https://www.wikidata.org/w/api.php"


@dataclass
class WikidataClient:
    """Client for fetching data from public Wikidata API.

    Parameters
    ----------
    batch_size : int
        Number of entities to fetch per API request.
    """

    batch_size: int = 50
    _session: requests.Session | None = field(default=None, repr=False)

    @property
    def session(self) -> requests.Session:
        """Get or create the requests session."""
        if self._session is None:
            self._session = requests.Session()
            self._session.headers.update(
                {"User-Agent": "FOVEA-Wikibase-Loader/1.0 (https://github.com/parafovea/fovea)"}
            )
        return self._session

    def fetch_entity(self, entity_id: str) -> dict[str, Any] | None:
        """Fetch a single entity from Wikidata.

        Parameters
        ----------
        entity_id : str
            The Wikidata entity ID (e.g., 'Q5').

        Returns
        -------
        dict[str, Any] | None
            The entity data, or None if not found.

        Raises
        ------
        WikidataFetchError
            If the API request fails.
        """
        try:
            response = self.session.get(
                WIKIDATA_API,
                params={
                    "action": "wbgetentities",
                    "ids": entity_id,
                    "format": "json",
                    "props": "labels|descriptions|claims|aliases|sitelinks",
                },
                timeout=30,
            )
            response.raise_for_status()
            data = response.json()

            entities: dict[str, Any] = data.get("entities", {})
            entity: dict[str, Any] | None = entities.get(entity_id)

            if entity and "missing" not in entity:
                return entity
            return None

        except requests.RequestException as e:
            raise WikidataFetchError(f"Failed to fetch entity {entity_id}: {e}") from e

    def fetch_entities(
        self, entity_ids: list[str], show_progress: bool = True
    ) -> dict[str, dict[str, Any]]:
        """Fetch multiple entities from Wikidata.

        Parameters
        ----------
        entity_ids : list[str]
            List of Wikidata entity IDs to fetch.
        show_progress : bool
            Whether to show a progress bar.

        Returns
        -------
        dict[str, dict[str, Any]]
            Dictionary mapping entity IDs to their data.

        Raises
        ------
        WikidataFetchError
            If the API request fails.
        """
        results: dict[str, dict[str, Any]] = {}

        # Batch the requests
        batches: list[list[str]] = [
            entity_ids[i : i + self.batch_size] for i in range(0, len(entity_ids), self.batch_size)
        ]

        for batch in tqdm(batches, desc="Fetching entities", disable=not show_progress):
            try:
                response = self.session.get(
                    WIKIDATA_API,
                    params={
                        "action": "wbgetentities",
                        "ids": "|".join(batch),
                        "format": "json",
                        "props": "labels|descriptions|claims|aliases",
                    },
                    timeout=60,
                )
                response.raise_for_status()
                data = response.json()

                for entity_id, entity_data in data.get("entities", {}).items():
                    if "missing" not in entity_data:
                        results[entity_id] = entity_data

            except requests.RequestException as e:
                logger.warning("Failed to fetch batch: %s", e)
                # Continue with next batch instead of failing entirely

        return results

    def get_related_entities(self, entity: dict[str, Any], max_depth: int = 1) -> set[str]:
        """Extract related entity IDs from an entity's claims.

        Parameters
        ----------
        entity : dict[str, Any]
            The entity data containing claims.
        max_depth : int
            Maximum depth for recursive entity extraction (not used directly,
            but indicates whether to extract related entities).

        Returns
        -------
        set[str]
            Set of related entity IDs found in claims.
        """
        related: set[str] = set()

        if max_depth <= 0:
            return related

        claims = entity.get("claims", {})
        for _prop_id, statements in claims.items():
            for statement in statements:
                mainsnak = statement.get("mainsnak", {})
                datavalue = mainsnak.get("datavalue", {})
                if datavalue.get("type") == "wikibase-entityid":
                    value = datavalue.get("value", {})
                    if "id" in value:
                        related.add(value["id"])

                # Also check qualifiers
                for qualifier_statements in statement.get("qualifiers", {}).values():
                    for qual in qualifier_statements:
                        qual_datavalue = qual.get("datavalue", {})
                        if qual_datavalue.get("type") == "wikibase-entityid":
                            qual_value = qual_datavalue.get("value", {})
                            if "id" in qual_value:
                                related.add(qual_value["id"])

        return related
