"""Import entities from a Wikidata JSON dump file.

This module provides functionality to import entities from a local Wikidata
JSON dump file in the standard Wikidata dump format.
"""

import gzip
import json
import logging
from collections.abc import Iterator
from pathlib import Path
from typing import Any

from tqdm import tqdm

from scripts.entity_converter import convert_wikidata_to_wikibase
from scripts.exceptions import ConfigurationError, WikibaseImportError
from scripts.wikibase_client import WikibaseClient

logger = logging.getLogger(__name__)


def read_dump_file(dump_path: str) -> Iterator[dict[str, Any]]:
    """Read entities from a Wikidata JSON dump file.

    Parameters
    ----------
    dump_path : str
        Path to the dump file (supports .json and .json.gz).

    Yields
    ------
    dict[str, Any]
        Entity data from the dump.

    Raises
    ------
    ConfigurationError
        If the file cannot be read.
    """
    path = Path(dump_path)
    if not path.exists():
        raise ConfigurationError(f"Dump file not found: {dump_path}")

    try:
        # Determine if file is gzipped and open with context manager
        if path.suffix == ".gz":
            file_ctx = gzip.open(path, "rt", encoding="utf-8")  # noqa: SIM115
        else:
            file_ctx = path.open(encoding="utf-8")
        with file_ctx as f:
            # Wikidata dumps are JSON arrays, one entity per line
            # Format: [{"id": "Q1", ...},\n{"id": "Q2", ...},\n...]
            for raw_line in f:
                line_content = raw_line.strip()
                # Skip array brackets
                if line_content in ("[", "]"):
                    continue
                # Remove trailing comma
                if line_content.endswith(","):
                    line_content = line_content[:-1]
                if line_content:
                    try:
                        entity = json.loads(line_content)
                        if isinstance(entity, dict) and "id" in entity:
                            yield entity
                    except json.JSONDecodeError as e:
                        logger.warning("Failed to parse line: %s", e)

    except OSError as e:
        raise ConfigurationError(f"Failed to read dump file: {e}") from e


def import_from_dump(
    client: WikibaseClient,
    dump_path: str,
    limit: int | None = None,
) -> int:
    """Import entities from a Wikidata JSON dump.

    Parameters
    ----------
    client : WikibaseClient
        Client for the local Wikibase instance.
    dump_path : str
        Path to the JSON dump file.
    limit : int | None
        Maximum number of entities to import (None for no limit).

    Returns
    -------
    int
        Number of entities successfully imported.

    Raises
    ------
    ConfigurationError
        If the dump file cannot be read.
    WikibaseImportError
        If import fails.
    """
    logger.info("Importing from dump file: %s", dump_path)

    # Authenticate with Wikibase
    client.login()

    imported_count = 0
    error_count = 0

    # Create progress bar
    entities = read_dump_file(dump_path)
    pbar = tqdm(entities, desc="Importing entities", unit="entities")

    for entity in pbar:
        if limit and imported_count >= limit:
            logger.info("Reached import limit: %d", limit)
            break

        try:
            # Convert and import
            wikibase_data = convert_wikidata_to_wikibase(entity)
            client.create_entity(wikibase_data)
            imported_count += 1

            # Update progress bar
            pbar.set_postfix(imported=imported_count, errors=error_count)

        except WikibaseImportError as e:
            error_count += 1
            logger.debug("Failed to import entity %s: %s", entity.get("id"), e)

    logger.info(
        "Import complete: %d imported, %d errors",
        imported_count,
        error_count,
    )
    return imported_count
