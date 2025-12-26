"""Import entities by instance-of type from Wikidata.

This module provides functionality to import entities that are instances
of specific types (using P31 instance-of property).
"""

import logging
from typing import TypedDict
from urllib.error import URLError

from SPARQLWrapper import JSON, SPARQLWrapper
from SPARQLWrapper.SPARQLExceptions import SPARQLWrapperException

from scripts.exceptions import WikidataFetchError
from scripts.import_entities import import_entities
from scripts.wikibase_client import WikibaseClient

logger = logging.getLogger(__name__)

WIKIDATA_SPARQL = "https://query.wikidata.org/sparql"


class SPARQLBinding(TypedDict):
    """A single SPARQL result binding."""

    value: str


class SPARQLResult(TypedDict):
    """A single SPARQL result row."""

    item: SPARQLBinding


class SPARQLResults(TypedDict):
    """SPARQL query results structure."""

    bindings: list[SPARQLResult]


class SPARQLResponse(TypedDict):
    """Full SPARQL JSON response."""

    results: SPARQLResults


def get_entities_by_type(
    type_ids: list[str],
    limit: int = 1000,
) -> list[str]:
    """Query Wikidata for entities of given types using SPARQL.

    Parameters
    ----------
    type_ids : list[str]
        List of type entity IDs (e.g., ['Q5'] for humans).
    limit : int
        Maximum number of entities to return.

    Returns
    -------
    list[str]
        List of entity IDs matching the type criteria.

    Raises
    ------
    WikidataFetchError
        If the SPARQL query fails.
    """
    sparql = SPARQLWrapper(WIKIDATA_SPARQL)
    sparql.addCustomHttpHeader(
        "User-Agent",
        "FOVEA-Wikibase-Loader/1.0 (https://github.com/parafovea/fovea)",
    )

    # Build SPARQL query for multiple types
    type_values = " ".join([f"wd:{t}" for t in type_ids])
    query = f"""
    SELECT DISTINCT ?item WHERE {{
        VALUES ?type {{ {type_values} }}
        ?item wdt:P31 ?type .
    }} LIMIT {limit}
    """

    try:
        sparql.setQuery(query)
        sparql.setReturnFormat(JSON)
        raw_results = sparql.query().convert()

        # SPARQLWrapper returns various types; for JSON format it's a dict
        if not isinstance(raw_results, dict):
            raise WikidataFetchError("Unexpected SPARQL response type")

        results: SPARQLResponse = raw_results  # type: ignore[assignment]

        entities: list[str] = []
        for result in results["results"]["bindings"]:
            uri = result["item"]["value"]
            qid = uri.split("/")[-1]
            entities.append(qid)

        logger.info("Found %d entities matching types: %s", len(entities), type_ids)
        return entities

    except WikidataFetchError:
        raise
    except (SPARQLWrapperException, URLError) as e:
        raise WikidataFetchError(f"SPARQL query failed: {e}") from e
    except KeyError as e:
        raise WikidataFetchError(f"Malformed SPARQL response: {e}") from e


def import_by_type(
    client: WikibaseClient,
    type_ids: list[str],
    limit: int = 1000,
    depth: int = 0,
) -> int:
    """Import entities of specific types from Wikidata.

    Parameters
    ----------
    client : WikibaseClient
        Client for the local Wikibase instance.
    type_ids : list[str]
        List of type entity IDs to import instances of.
    limit : int
        Maximum number of entities to import per type.
    depth : int
        Recursion depth for following entity references.

    Returns
    -------
    int
        Number of entities successfully imported.

    Raises
    ------
    WikibaseImportError
        If import fails.
    """
    logger.info("Importing entities of types: %s", type_ids)

    # Get entity IDs matching the types
    entity_ids = get_entities_by_type(type_ids, limit=limit)

    if not entity_ids:
        logger.warning("No entities found for types: %s", type_ids)
        return 0

    # Import the entities
    result = import_entities(client, entity_ids, depth=depth)
    return result.count
