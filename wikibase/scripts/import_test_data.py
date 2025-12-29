"""Import minimal test data for development and testing.

This module provides functionality to import a small set of representative
Wikidata entities for testing the FOVEA annotation workflow.
"""

import logging

from scripts.import_entities import import_entities
from scripts.wikibase_client import WikibaseClient

logger = logging.getLogger(__name__)

# Default test entities - a small representative set
DEFAULT_TEST_ENTITIES = [
    # Entity types
    "Q5",  # human
    "Q515",  # city
    "Q6256",  # country
    "Q82799",  # name
    "Q16521",  # taxon
    # Event types
    "Q198",  # war
    "Q178651",  # battle
    "Q1190554",  # occurrence
    # Sample entities
    "Q937",  # Albert Einstein (person)
    "Q60",  # New York City (city)
    "Q30",  # United States (country)
    "Q183",  # Germany (country)
    "Q42",  # Douglas Adams (person)
    "Q7186",  # Marie Curie (person)
]


def import_test_data(
    client: WikibaseClient,
    entities: list[str] | None = None,
    depth: int = 0,
) -> int:
    """Import test data into local Wikibase.

    Parameters
    ----------
    client : WikibaseClient
        Client for the local Wikibase instance.
    entities : list[str] | None
        Entity IDs to import, or None for default test set.
    depth : int
        Recursion depth for following references.

    Returns
    -------
    int
        Number of entities successfully imported.
    """
    entity_list = entities or DEFAULT_TEST_ENTITIES

    logger.info("Importing test data: %d entities", len(entity_list))
    logger.info("Entities: %s", ", ".join(entity_list))

    result = import_entities(client, entity_list, depth=depth)
    return result.count
