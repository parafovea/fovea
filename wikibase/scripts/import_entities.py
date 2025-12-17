"""Import entities from Wikidata by entity ID list.

This module provides functionality to import specific entities from Wikidata
into a local Wikibase instance, with optional recursive fetching of related
entities.
"""

import json
import logging
from dataclasses import dataclass, field
from pathlib import Path

from tqdm import tqdm

from scripts.entity_converter import convert_wikidata_to_wikibase
from scripts.exceptions import WikibaseImportError
from scripts.wikibase_client import WikibaseClient
from scripts.wikidata_client import WikidataClient

logger = logging.getLogger(__name__)

# Default path for ID mapping file (in output directory for writability)
DEFAULT_MAPPING_PATH = Path("/app/output/id-mapping.json")


@dataclass
class ImportConfig:
    """Configuration for entity import.

    Parameters
    ----------
    entities : list[str]
        List of Wikidata entity IDs to import.
    depth : int
        Recursion depth for following entity references.
    """

    entities: list[str]
    depth: int = 1


@dataclass
class EntityImporter:
    """Imports entities from Wikidata to local Wikibase.

    Parameters
    ----------
    wikibase : WikibaseClient
        Client for the local Wikibase instance.
    wikidata : WikidataClient
        Client for fetching from public Wikidata.
    """

    wikibase: WikibaseClient
    wikidata: WikidataClient = field(default_factory=WikidataClient)
    _imported_ids: set[str] = field(default_factory=set)
    _id_mapping: dict[str, str] = field(default_factory=dict)

    @property
    def id_mapping(self) -> dict[str, str]:
        """Get the mapping from Wikidata IDs to local Wikibase IDs.

        Returns
        -------
        dict[str, str]
            Mapping of Wikidata ID -> local Wikibase ID.
        """
        return self._id_mapping

    def import_entity(self, entity_id: str) -> bool:
        """Import a single entity from Wikidata.

        Parameters
        ----------
        entity_id : str
            The Wikidata entity ID to import.

        Returns
        -------
        bool
            True if the entity was imported or already exists.
        """
        # Skip if already imported
        if entity_id in self._imported_ids:
            return True

        # Fetch from Wikidata
        wikidata_entity = self.wikidata.fetch_entity(entity_id)
        if not wikidata_entity:
            logger.warning("Entity %s not found in Wikidata", entity_id)
            return False

        # Convert to Wikibase format
        # Note: sitelinks to wikidatawiki require site configuration in MediaWiki
        # which is not available by default, so we disable them
        wikibase_data = convert_wikidata_to_wikibase(
            wikidata_entity, include_wikidata_sitelink=False
        )

        try:
            # Create in local Wikibase and track the assigned ID
            local_id = self.wikibase.create_entity(wikibase_data)
            self._imported_ids.add(entity_id)
            self._id_mapping[entity_id] = local_id
            logger.debug("Mapped %s -> %s", entity_id, local_id)
            return True
        except WikibaseImportError as e:
            logger.error("Failed to import entity %s: %s", entity_id, e)
            return False

    def import_with_depth(self, entity_ids: list[str], depth: int = 1) -> int:
        """Import entities with recursive following of references.

        Parameters
        ----------
        entity_ids : list[str]
            List of entity IDs to import.
        depth : int
            Maximum depth for following entity references.

        Returns
        -------
        int
            Number of entities successfully imported.
        """
        # Collect all entities to import
        all_entities: set[str] = set(entity_ids)
        current_batch: set[str] = set(entity_ids)

        for d in range(depth):
            if not current_batch:
                break

            logger.info("Depth %d: Processing %d entities", d, len(current_batch))

            # Fetch current batch
            entities_data = self.wikidata.fetch_entities(list(current_batch))

            # Find related entities for next depth level
            next_batch: set[str] = set()
            for entity_data in entities_data.values():
                related = self.wikidata.get_related_entities(entity_data, depth - d)
                next_batch.update(related - all_entities)

            all_entities.update(next_batch)
            current_batch = next_batch

        logger.info("Total entities to import: %d", len(all_entities))

        # Import all collected entities
        imported_count = 0
        for entity_id in tqdm(all_entities, desc="Importing entities"):
            if self.import_entity(entity_id):
                imported_count += 1

        return imported_count


@dataclass
class ImportResult:
    """Result of an entity import operation.

    Parameters
    ----------
    count : int
        Number of entities successfully imported.
    id_mapping : dict[str, str]
        Mapping of Wikidata ID -> local Wikibase ID.
    """

    count: int
    id_mapping: dict[str, str]


def save_id_mapping(
    mapping: dict[str, str],
    path: Path = DEFAULT_MAPPING_PATH,
) -> None:
    """Save the ID mapping to a JSON file.

    Parameters
    ----------
    mapping : dict[str, str]
        Mapping of Wikidata ID -> local Wikibase ID.
    path : Path
        Path to save the mapping file.
    """
    # Ensure directory exists
    path.parent.mkdir(parents=True, exist_ok=True)

    with open(path, "w") as f:
        json.dump(mapping, f, indent=2, sort_keys=True)

    logger.info("Saved ID mapping to %s (%d entries)", path, len(mapping))


def load_id_mapping(path: Path = DEFAULT_MAPPING_PATH) -> dict[str, str]:
    """Load the ID mapping from a JSON file.

    Parameters
    ----------
    path : Path
        Path to the mapping file.

    Returns
    -------
    dict[str, str]
        Mapping of Wikidata ID -> local Wikibase ID.
    """
    if not path.exists():
        return {}

    with open(path) as f:
        mapping: dict[str, str] = json.load(f)
    return mapping


def import_entities(
    client: WikibaseClient,
    entity_ids: list[str],
    depth: int = 1,
    mapping_path: Path | None = DEFAULT_MAPPING_PATH,
) -> ImportResult:
    """Import entities from Wikidata into local Wikibase.

    Parameters
    ----------
    client : WikibaseClient
        Client for the local Wikibase instance.
    entity_ids : list[str]
        List of Wikidata entity IDs to import.
    depth : int
        Recursion depth for following entity references.
    mapping_path : Path | None
        Path to save the ID mapping. If None, mapping is not saved to disk.

    Returns
    -------
    ImportResult
        Result containing count and ID mapping.

    Raises
    ------
    WikibaseImportError
        If import fails due to authentication or connection issues.
    """
    logger.info("Importing %d entities with depth %d", len(entity_ids), depth)

    # Authenticate with Wikibase
    client.login()

    # Create importer and run
    importer = EntityImporter(wikibase=client)
    count = importer.import_with_depth(entity_ids, depth=depth)

    # Save the ID mapping
    if mapping_path is not None and importer.id_mapping:
        save_id_mapping(importer.id_mapping, mapping_path)

    return ImportResult(count=count, id_mapping=importer.id_mapping)
