"""Import entities from a YAML configuration file.

This module provides functionality to import entities based on a combined
YAML configuration file that can specify multiple import methods.
"""

import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import yaml
from pydantic import BaseModel, Field, ValidationError

from scripts.exceptions import ConfigurationError, WikidataFetchError
from scripts.import_entities import import_entities
from scripts.import_sparql import execute_sparql_query
from scripts.import_types import get_entities_by_type
from scripts.wikibase_client import WikibaseClient

logger = logging.getLogger(__name__)


class TypeConfig(BaseModel):
    """Configuration for importing entities by type."""

    limit: int = Field(default=1000, description="Maximum entities to import")
    properties: list[str] | str = Field(
        default="all",
        description="Properties to include or 'all'",
    )


class SPARQLQueryConfig(BaseModel):
    """Configuration for a SPARQL query."""

    name: str = Field(description="Query name for logging")
    file: str | None = Field(default=None, description="Path to query file")
    query: str | None = Field(default=None, description="Inline query")


class EntitiesConfig(BaseModel):
    """Configuration for entity specifications."""

    direct: list[str] = Field(default_factory=list, description="Direct entity IDs")
    by_type: dict[str, TypeConfig] = Field(
        default_factory=dict,
        description="Entities by instance-of type",
    )
    sparql_queries: list[SPARQLQueryConfig] = Field(
        default_factory=list,
        description="SPARQL queries to execute",
    )


class ImportConfigFile(BaseModel):
    """Root configuration for import file."""

    version: str = Field(default="1.0", description="Config version")
    name: str = Field(default="", description="Dataset name")
    entities: EntitiesConfig = Field(
        default_factory=EntitiesConfig,
        description="Entity specifications",
    )
    required_properties: list[str] = Field(
        default_factory=list,
        description="Properties to always include",
    )
    reference_depth: int = Field(default=1, description="Depth for following references")
    output: dict[str, Any] = Field(
        default_factory=dict,
        description="Output settings",
    )


@dataclass
class ConfigImporter:
    """Imports entities based on configuration file.

    Parameters
    ----------
    client : WikibaseClient
        Client for the local Wikibase instance.
    config : ImportConfigFile
        Parsed configuration file.
    config_dir : Path
        Directory containing the config file (for relative paths).
    """

    client: WikibaseClient
    config: ImportConfigFile
    config_dir: Path
    _collected_entities: set[str] = field(default_factory=set)

    def collect_entities(self) -> set[str]:
        """Collect all entity IDs from configuration.

        Returns
        -------
        set[str]
            Set of all entity IDs to import.
        """
        entities = self.config.entities

        # Direct entities
        self._collected_entities.update(entities.direct)
        logger.info("Added %d direct entities", len(entities.direct))

        # By type
        for type_id, type_config in entities.by_type.items():
            try:
                type_entities = get_entities_by_type([type_id], limit=type_config.limit)
                self._collected_entities.update(type_entities)
                logger.info("Added %d entities of type %s", len(type_entities), type_id)
            except WikidataFetchError as e:
                logger.warning("Failed to get entities for type %s: %s", type_id, e)

        # SPARQL queries
        for query_config in entities.sparql_queries:
            try:
                query = self._get_query(query_config)
                if query:
                    query_entities = execute_sparql_query(query)
                    self._collected_entities.update(query_entities)
                    logger.info(
                        "Added %d entities from query '%s'",
                        len(query_entities),
                        query_config.name,
                    )
            except WikidataFetchError as e:
                logger.warning("Failed query '%s': %s", query_config.name, e)

        return self._collected_entities

    def _get_query(self, config: SPARQLQueryConfig) -> str | None:
        """Get SPARQL query from config."""
        if config.query:
            return config.query
        if config.file:
            path = self.config_dir / config.file
            if path.exists():
                return path.read_text()
            logger.warning("Query file not found: %s", path)
        return None

    def run_import(self) -> int:
        """Run the import process.

        Returns
        -------
        int
            Number of entities imported.
        """
        entities = self.collect_entities()
        if not entities:
            logger.warning("No entities to import")
            return 0

        logger.info("Total entities to import: %d", len(entities))
        result = import_entities(
            self.client,
            list(entities),
            depth=self.config.reference_depth,
        )
        return result.count


def load_config(config_path: str) -> ImportConfigFile:
    """Load and validate configuration file.

    Parameters
    ----------
    config_path : str
        Path to YAML configuration file.

    Returns
    -------
    ImportConfigFile
        Parsed and validated configuration.

    Raises
    ------
    ConfigurationError
        If file cannot be read or is invalid.
    """
    path = Path(config_path)
    if not path.exists():
        raise ConfigurationError(f"Config file not found: {config_path}")

    try:
        with path.open() as f:
            data = yaml.safe_load(f)
        return ImportConfigFile.model_validate(data)
    except yaml.YAMLError as e:
        raise ConfigurationError(f"Invalid YAML: {e}") from e
    except ValidationError as e:
        raise ConfigurationError(f"Config validation failed: {e}") from e


def import_from_config(client: WikibaseClient, config_path: str) -> int:
    """Import entities from a configuration file.

    Parameters
    ----------
    client : WikibaseClient
        Client for the local Wikibase instance.
    config_path : str
        Path to YAML configuration file.

    Returns
    -------
    int
        Number of entities successfully imported.
    """
    logger.info("Loading configuration from: %s", config_path)
    config = load_config(config_path)
    config_dir = Path(config_path).parent

    logger.info("Dataset: %s", config.name)
    logger.info("Reference depth: %d", config.reference_depth)

    importer = ConfigImporter(
        client=client,
        config=config,
        config_dir=config_dir,
    )
    return importer.run_import()
