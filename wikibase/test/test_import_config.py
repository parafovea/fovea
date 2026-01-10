"""Tests for import_config module."""

from pathlib import Path

import pytest
import yaml

from scripts.exceptions import ConfigurationError
from scripts.import_config import ImportConfigFile, load_config


class TestLoadConfig:
    """Tests for load_config function."""

    def test_loads_valid_config(self, tmp_path: Path) -> None:
        """Test loading a valid configuration file."""
        config_data = {
            "version": "1.0",
            "name": "Test Dataset",
            "entities": {
                "direct": ["Q5", "Q515"],
            },
            "reference_depth": 2,
        }

        config_file = tmp_path / "config.yaml"
        with config_file.open("w") as f:
            yaml.dump(config_data, f)

        config = load_config(str(config_file))

        assert config.version == "1.0"
        assert config.name == "Test Dataset"
        assert config.entities.direct == ["Q5", "Q515"]
        assert config.reference_depth == 2

    def test_raises_for_missing_file(self) -> None:
        """Test that missing file raises ConfigurationError."""
        with pytest.raises(ConfigurationError, match="not found"):
            load_config("/nonexistent/config.yaml")

    def test_raises_for_invalid_yaml(self, tmp_path: Path) -> None:
        """Test that invalid YAML raises ConfigurationError."""
        config_file = tmp_path / "invalid.yaml"
        config_file.write_text("invalid: yaml: content: [")

        with pytest.raises(ConfigurationError, match="Invalid YAML"):
            load_config(str(config_file))

    def test_uses_defaults_for_missing_fields(self, tmp_path: Path) -> None:
        """Test that missing fields use default values."""
        config_file = tmp_path / "minimal.yaml"
        config_file.write_text("{}")

        config = load_config(str(config_file))

        assert config.version == "1.0"
        assert config.name == ""
        assert config.reference_depth == 1
        assert config.entities.direct == []


class TestImportConfigFile:
    """Tests for ImportConfigFile model."""

    def test_creates_with_defaults(self) -> None:
        """Test creation with default values."""
        config = ImportConfigFile()

        assert config.version == "1.0"
        assert config.reference_depth == 1
        assert config.entities.direct == []

    def test_validates_entities_config(self) -> None:
        """Test entities configuration validation."""
        config = ImportConfigFile(
            entities={
                "direct": ["Q1", "Q2"],
                "by_type": {
                    "Q5": {"limit": 100},
                },
            }
        )

        assert config.entities.direct == ["Q1", "Q2"]
        assert "Q5" in config.entities.by_type
        assert config.entities.by_type["Q5"].limit == 100

    def test_sparql_queries_config(self) -> None:
        """Test SPARQL queries configuration."""
        config = ImportConfigFile(
            entities={
                "sparql_queries": [
                    {"name": "Test Query", "query": "SELECT ?item WHERE {}"},
                ],
            }
        )

        assert len(config.entities.sparql_queries) == 1
        assert config.entities.sparql_queries[0].name == "Test Query"
