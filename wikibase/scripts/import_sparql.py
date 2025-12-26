"""Import entities via SPARQL query from Wikidata.

This module provides functionality to import entities based on a SPARQL
query file that defines which entities to include.
"""

import logging
from pathlib import Path
from typing import TypedDict
from urllib.error import URLError
from urllib.parse import urlparse

from SPARQLWrapper import JSON, SPARQLWrapper
from SPARQLWrapper.SPARQLExceptions import SPARQLWrapperException

from scripts.exceptions import ConfigurationError, WikidataFetchError
from scripts.import_entities import import_entities
from scripts.wikibase_client import WikibaseClient

logger = logging.getLogger(__name__)

WIKIDATA_SPARQL = "https://query.wikidata.org/sparql"


class SPARQLBinding(TypedDict):
    """A single SPARQL result binding."""

    value: str


class SPARQLResultsContainer(TypedDict):
    """SPARQL results container."""

    bindings: list[dict[str, SPARQLBinding]]


class SPARQLResponse(TypedDict):
    """Full SPARQL JSON response."""

    results: SPARQLResultsContainer


def execute_sparql_query(query: str) -> list[str]:
    """Execute a SPARQL query and extract entity IDs.

    Parameters
    ----------
    query : str
        SPARQL SELECT query that returns ?item bindings.

    Returns
    -------
    list[str]
        List of entity IDs from the query results.

    Raises
    ------
    WikidataFetchError
        If the query execution fails.
    """
    sparql = SPARQLWrapper(WIKIDATA_SPARQL)
    sparql.addCustomHttpHeader(
        "User-Agent",
        "FOVEA-Wikibase-Loader/1.0 (https://github.com/parafovea/fovea)",
    )

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
            # Handle different variable names
            for var in ["item", "entity", "subject", "s"]:
                if var in result:
                    uri = result[var]["value"]
                    # Properly validate URL host to prevent SSRF
                    parsed = urlparse(uri)
                    if parsed.netloc in ("www.wikidata.org", "wikidata.org"):
                        qid = parsed.path.split("/")[-1]
                        if qid.startswith("Q") and qid[1:].isdigit():
                            entities.append(qid)
                    break

        logger.info("SPARQL query returned %d entities", len(entities))
        return entities

    except WikidataFetchError:
        raise
    except (SPARQLWrapperException, URLError) as e:
        raise WikidataFetchError(f"SPARQL query failed: {e}") from e
    except KeyError as e:
        raise WikidataFetchError(f"Malformed SPARQL response: {e}") from e


def import_from_sparql(
    client: WikibaseClient,
    sparql_file: str,
    depth: int = 0,
) -> int:
    """Import entities based on a SPARQL query file.

    Parameters
    ----------
    client : WikibaseClient
        Client for the local Wikibase instance.
    sparql_file : str
        Path to SPARQL query file.
    depth : int
        Recursion depth for following entity references.

    Returns
    -------
    int
        Number of entities successfully imported.

    Raises
    ------
    ConfigurationError
        If the SPARQL file cannot be read.
    WikidataFetchError
        If the query execution fails.
    """
    path = Path(sparql_file)
    if not path.exists():
        raise ConfigurationError(f"SPARQL file not found: {sparql_file}")

    logger.info("Loading SPARQL query from: %s", sparql_file)
    query = path.read_text()

    # Execute query to get entity IDs
    entity_ids = execute_sparql_query(query)

    if not entity_ids:
        logger.warning("SPARQL query returned no entities")
        return 0

    # Import the entities
    result = import_entities(client, entity_ids, depth=depth)
    return result.count
