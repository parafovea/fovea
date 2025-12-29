"""Main entry point for Wikibase data loader.

This module determines the import mode based on environment variables
and dispatches to the appropriate import function.
"""

import logging
import os
import sys
import time

import requests

from scripts.exceptions import ConfigurationError, WikibaseImportError, WikidataFetchError
from scripts.import_config import import_from_config
from scripts.import_dump import import_from_dump
from scripts.import_entities import import_entities
from scripts.import_sparql import import_from_sparql
from scripts.import_test_data import import_test_data
from scripts.import_types import import_by_type
from scripts.wikibase_client import WikibaseClient

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)


def wait_for_wikibase(client: WikibaseClient, max_retries: int = 30, delay: int = 5) -> bool:
    """Wait for Wikibase to be ready.

    Parameters
    ----------
    client : WikibaseClient
        Wikibase client to check connectivity.
    max_retries : int
        Maximum number of retry attempts.
    delay : int
        Delay in seconds between retries.

    Returns
    -------
    bool
        True if Wikibase is ready, False otherwise.
    """
    for attempt in range(max_retries):
        if client.is_available():
            logger.info("Wikibase is ready")
            return True
        logger.info(
            "Waiting for Wikibase to be ready (attempt %d/%d)...",
            attempt + 1,
            max_retries,
        )
        time.sleep(delay)

    logger.error("Wikibase did not become ready in time")
    return False


def main() -> int:
    """Main entry point for data loader.

    Returns
    -------
    int
        Exit code (0 for success, 1 for failure).
    """
    logger.info("FOVEA Wikibase Data Loader")
    logger.info("=" * 40)

    # Get Wikibase connection details
    wikibase_url = os.environ.get("WIKIBASE_URL", "http://wikibase")
    admin_user = os.environ.get("WIKIBASE_ADMIN_USER", "admin")
    admin_pass = os.environ.get("WIKIBASE_ADMIN_PASS", "adminpass123")

    # Create Wikibase client
    client = WikibaseClient(
        base_url=wikibase_url,
        username=admin_user,
        password=admin_pass,
    )

    # Wait for Wikibase to be ready
    if not wait_for_wikibase(client):
        return 1

    try:
        # Determine import mode based on environment variables
        dump_path = os.environ.get("WIKIDATA_DUMP_PATH")
        sparql_file = os.environ.get("WIKIDATA_SPARQL_FILE")
        entities = os.environ.get("WIKIDATA_ENTITIES")
        types = os.environ.get("WIKIDATA_TYPES")
        config_file = os.environ.get("WIKIDATA_CONFIG_FILE")
        depth = int(os.environ.get("WIKIDATA_DEPTH", "1"))

        imported_count = 0

        if dump_path:
            logger.info("Mode A: Loading from local dump file: %s", dump_path)
            imported_count = import_from_dump(client, dump_path)

        elif sparql_file:
            logger.info("Mode B.1: Loading via SPARQL query file: %s", sparql_file)
            imported_count = import_from_sparql(client, sparql_file)

        elif entities:
            logger.info("Mode B.2: Loading entity list with depth=%d", depth)
            entity_list = [e.strip() for e in entities.split(",")]
            result = import_entities(client, entity_list, depth=depth)
            imported_count = result.count

        elif types:
            logger.info("Mode B.3: Loading by instance-of types: %s", types)
            type_list = [t.strip() for t in types.split(",")]
            imported_count = import_by_type(client, type_list)

        elif config_file:
            logger.info("Mode B.4: Loading from config file: %s", config_file)
            imported_count = import_from_config(client, config_file)

        else:
            logger.info("No data loading mode specified. Loading test data...")
            imported_count = import_test_data(client)

        logger.info("Data import completed successfully!")
        logger.info("Total entities imported: %d", imported_count)
        return 0

    except (
        WikibaseImportError,
        ConfigurationError,
        WikidataFetchError,
        requests.RequestException,
        ValueError,
        OSError,
    ) as e:
        logger.error("Import failed: %s", e)
        return 1


if __name__ == "__main__":
    sys.exit(main())
