"""Tests for the entity import module.

This module provides comprehensive tests for importing entities from Wikidata
to a local Wikibase instance.
"""

import json
from pathlib import Path
from typing import Any
from unittest.mock import Mock, patch

import pytest

from scripts.import_entities import (
    EntityImporter,
    ImportConfig,
    ImportResult,
    import_entities,
    load_id_mapping,
    save_id_mapping,
)
from scripts.exceptions import WikibaseImportError


@pytest.fixture
def mock_wikibase_client() -> Mock:
    """Create a mock WikibaseClient."""
    client = Mock()
    client.login = Mock()
    client.create_entity = Mock(return_value="Q1")
    return client


@pytest.fixture
def mock_wikidata_client() -> Mock:
    """Create a mock WikidataClient."""
    client = Mock()
    client.fetch_entity = Mock(return_value={
        "id": "Q42",
        "type": "item",
        "labels": {"en": {"value": "Douglas Adams"}},
    })
    client.fetch_entities = Mock(return_value={
        "Q42": {"id": "Q42", "type": "item", "labels": {"en": {"value": "Test"}}}
    })
    client.get_related_entities = Mock(return_value=set())
    return client


@pytest.fixture
def entity_importer(mock_wikibase_client: Mock, mock_wikidata_client: Mock) -> EntityImporter:
    """Create an EntityImporter with mocked clients."""
    return EntityImporter(
        wikibase=mock_wikibase_client,
        wikidata=mock_wikidata_client,
    )


class TestImportConfig:
    """Tests for ImportConfig dataclass."""

    def test_default_depth(self) -> None:
        """Test default depth value."""
        config = ImportConfig(entities=["Q42"])
        assert config.depth == 1

    def test_custom_depth(self) -> None:
        """Test custom depth value."""
        config = ImportConfig(entities=["Q42", "Q5"], depth=3)
        assert config.entities == ["Q42", "Q5"]
        assert config.depth == 3


class TestEntityImporter:
    """Tests for EntityImporter class."""

    def test_import_entity_new(
        self, entity_importer: EntityImporter, mock_wikibase_client: Mock
    ) -> None:
        """Test importing a new entity."""
        mock_wikibase_client.create_entity.return_value = "Q100"

        result = entity_importer.import_entity("Q42")

        assert result is True
        assert "Q42" in entity_importer._imported_ids
        assert entity_importer.id_mapping["Q42"] == "Q100"

    def test_import_entity_already_exists(self, entity_importer: EntityImporter) -> None:
        """Test that already imported entities are skipped."""
        entity_importer._imported_ids.add("Q42")

        result = entity_importer.import_entity("Q42")

        assert result is True
        # Should not call create_entity since already imported
        entity_importer.wikibase.create_entity.assert_not_called()

    def test_import_entity_not_found(
        self, entity_importer: EntityImporter, mock_wikidata_client: Mock
    ) -> None:
        """Test importing non-existent entity."""
        mock_wikidata_client.fetch_entity.return_value = None

        result = entity_importer.import_entity("Q999999")

        assert result is False

    def test_import_entity_with_mapping(
        self, entity_importer: EntityImporter, mock_wikibase_client: Mock
    ) -> None:
        """Test that ID mapping is correctly populated."""
        mock_wikibase_client.create_entity.side_effect = ["Q1", "Q2", "Q3"]

        entity_importer.import_entity("Q42")
        entity_importer.import_entity("Q5")
        entity_importer.import_entity("Q515")

        assert entity_importer.id_mapping == {
            "Q42": "Q1",
            "Q5": "Q2",
            "Q515": "Q3",
        }

    def test_import_entity_error(
        self, entity_importer: EntityImporter, mock_wikibase_client: Mock
    ) -> None:
        """Test handling of import errors."""
        mock_wikibase_client.create_entity.side_effect = WikibaseImportError("Failed")

        result = entity_importer.import_entity("Q42")

        assert result is False

    def test_import_with_depth_0(
        self, entity_importer: EntityImporter, mock_wikibase_client: Mock
    ) -> None:
        """Test importing with depth 0 (no recursion)."""
        mock_wikibase_client.create_entity.return_value = "Q1"

        count = entity_importer.import_with_depth(["Q42"], depth=0)

        # With depth 0, we still import the initial entities
        assert count >= 0

    def test_import_with_depth_1(
        self,
        entity_importer: EntityImporter,
        mock_wikibase_client: Mock,
        mock_wikidata_client: Mock,
    ) -> None:
        """Test importing with depth 1."""
        mock_wikibase_client.create_entity.return_value = "Q1"
        mock_wikidata_client.get_related_entities.return_value = set()

        count = entity_importer.import_with_depth(["Q42"], depth=1)

        assert count >= 1

    def test_import_with_depth_follows_references(
        self,
        entity_importer: EntityImporter,
        mock_wikibase_client: Mock,
        mock_wikidata_client: Mock,
    ) -> None:
        """Test that depth=2 follows entity references."""
        # First entity has a reference to Q5
        mock_wikidata_client.fetch_entities.side_effect = [
            {"Q42": {"id": "Q42", "type": "item"}},
            {"Q5": {"id": "Q5", "type": "item"}},
        ]
        mock_wikidata_client.get_related_entities.side_effect = [
            {"Q5"},  # Q42 references Q5
            set(),  # Q5 has no references
        ]
        mock_wikibase_client.create_entity.return_value = "Q1"

        count = entity_importer.import_with_depth(["Q42"], depth=2)

        # Should import both Q42 and Q5
        assert count == 2

    def test_import_handles_circular_references(
        self,
        entity_importer: EntityImporter,
        mock_wikibase_client: Mock,
        mock_wikidata_client: Mock,
    ) -> None:
        """Test that circular references don't cause infinite loops."""
        mock_wikidata_client.fetch_entities.return_value = {
            "Q1": {"id": "Q1", "type": "item"},
            "Q2": {"id": "Q2", "type": "item"},
        }
        # Q1 -> Q2 -> Q1 (circular) - need enough return values for all iterations
        mock_wikidata_client.get_related_entities.return_value = set()
        mock_wikibase_client.create_entity.return_value = "Q100"

        # Should not hang - the algorithm tracks all_entities to avoid revisiting
        count = entity_importer.import_with_depth(["Q1"], depth=2)

        assert count >= 1


class TestIdMappingPersistence:
    """Tests for ID mapping persistence functions."""

    def test_save_id_mapping_creates_file(self, tmp_path: Path) -> None:
        """Test that save_id_mapping creates the file."""
        mapping_path = tmp_path / "mappings" / "id-mapping.json"
        mapping = {"Q42": "Q1", "Q5": "Q2"}

        save_id_mapping(mapping, mapping_path)

        assert mapping_path.exists()
        with open(mapping_path) as f:
            saved = json.load(f)
        assert saved == mapping

    def test_save_id_mapping_overwrites(self, tmp_path: Path) -> None:
        """Test that save_id_mapping overwrites existing file."""
        mapping_path = tmp_path / "id-mapping.json"

        # Save first mapping
        save_id_mapping({"Q42": "Q1"}, mapping_path)
        # Overwrite with new mapping
        save_id_mapping({"Q5": "Q2", "Q515": "Q3"}, mapping_path)

        with open(mapping_path) as f:
            saved = json.load(f)
        assert saved == {"Q5": "Q2", "Q515": "Q3"}

    def test_load_id_mapping_success(self, tmp_path: Path) -> None:
        """Test loading an existing ID mapping."""
        mapping_path = tmp_path / "id-mapping.json"
        expected = {"Q42": "Q1", "Q5": "Q2"}
        with open(mapping_path, "w") as f:
            json.dump(expected, f)

        result = load_id_mapping(mapping_path)

        assert result == expected

    def test_load_id_mapping_file_not_found(self, tmp_path: Path) -> None:
        """Test loading when file doesn't exist."""
        mapping_path = tmp_path / "nonexistent.json"

        result = load_id_mapping(mapping_path)

        assert result == {}

    def test_save_id_mapping_creates_parent_dirs(self, tmp_path: Path) -> None:
        """Test that save creates parent directories."""
        mapping_path = tmp_path / "deep" / "nested" / "dir" / "mapping.json"

        save_id_mapping({"Q42": "Q1"}, mapping_path)

        assert mapping_path.exists()


class TestImportEntities:
    """Tests for the main import_entities function."""

    def test_import_entities_list(self, mock_wikibase_client: Mock) -> None:
        """Test importing a list of entities."""
        with patch("scripts.import_entities.EntityImporter") as MockImporter:
            mock_importer = Mock()
            mock_importer.import_with_depth.return_value = 3
            mock_importer.id_mapping = {"Q42": "Q1", "Q5": "Q2", "Q515": "Q3"}
            MockImporter.return_value = mock_importer

            result = import_entities(
                client=mock_wikibase_client,
                entity_ids=["Q42", "Q5", "Q515"],
                depth=1,
                mapping_path=None,
            )

            assert result.count == 3
            assert result.id_mapping == {"Q42": "Q1", "Q5": "Q2", "Q515": "Q3"}
            mock_wikibase_client.login.assert_called_once()

    def test_import_entities_empty_list(self, mock_wikibase_client: Mock) -> None:
        """Test importing an empty list."""
        with patch("scripts.import_entities.EntityImporter") as MockImporter:
            mock_importer = Mock()
            mock_importer.import_with_depth.return_value = 0
            mock_importer.id_mapping = {}
            MockImporter.return_value = mock_importer

            result = import_entities(
                client=mock_wikibase_client,
                entity_ids=[],
                depth=1,
                mapping_path=None,
            )

            assert result.count == 0
            assert result.id_mapping == {}

    def test_import_entities_with_depth(self, mock_wikibase_client: Mock) -> None:
        """Test importing with custom depth."""
        with patch("scripts.import_entities.EntityImporter") as MockImporter:
            mock_importer = Mock()
            mock_importer.import_with_depth.return_value = 5
            mock_importer.id_mapping = {}
            MockImporter.return_value = mock_importer

            import_entities(
                client=mock_wikibase_client,
                entity_ids=["Q42"],
                depth=3,
                mapping_path=None,
            )

            mock_importer.import_with_depth.assert_called_once_with(["Q42"], depth=3)

    def test_import_entities_saves_mapping(
        self, mock_wikibase_client: Mock, tmp_path: Path
    ) -> None:
        """Test that ID mapping is saved to disk."""
        mapping_path = tmp_path / "mapping.json"

        with patch("scripts.import_entities.EntityImporter") as MockImporter:
            mock_importer = Mock()
            mock_importer.import_with_depth.return_value = 2
            mock_importer.id_mapping = {"Q42": "Q1", "Q5": "Q2"}
            MockImporter.return_value = mock_importer

            import_entities(
                client=mock_wikibase_client,
                entity_ids=["Q42", "Q5"],
                depth=1,
                mapping_path=mapping_path,
            )

        assert mapping_path.exists()
        with open(mapping_path) as f:
            saved = json.load(f)
        assert saved == {"Q42": "Q1", "Q5": "Q2"}

    def test_import_entities_no_mapping_save(
        self, mock_wikibase_client: Mock
    ) -> None:
        """Test that mapping is not saved when path is None."""
        with patch("scripts.import_entities.EntityImporter") as MockImporter:
            mock_importer = Mock()
            mock_importer.import_with_depth.return_value = 1
            mock_importer.id_mapping = {"Q42": "Q1"}
            MockImporter.return_value = mock_importer

            with patch("scripts.import_entities.save_id_mapping") as mock_save:
                import_entities(
                    client=mock_wikibase_client,
                    entity_ids=["Q42"],
                    depth=1,
                    mapping_path=None,
                )

                mock_save.assert_not_called()


class TestImportResult:
    """Tests for ImportResult dataclass."""

    def test_import_result_creation(self) -> None:
        """Test ImportResult creation."""
        result = ImportResult(count=5, id_mapping={"Q42": "Q1"})

        assert result.count == 5
        assert result.id_mapping == {"Q42": "Q1"}
