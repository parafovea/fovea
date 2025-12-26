"""Tests for entity_converter module."""

from typing import Any

from scripts.entity_converter import (
    convert_wikidata_to_wikibase,
    extract_entity_references,
)


class TestConvertWikidataToWikibase:
    """Tests for convert_wikidata_to_wikibase function."""

    def test_converts_labels(self, sample_wikidata_entity: dict[str, Any]) -> None:
        """Test that labels are correctly converted."""
        result = convert_wikidata_to_wikibase(sample_wikidata_entity)

        assert "labels" in result
        assert "en" in result["labels"]
        assert result["labels"]["en"]["language"] == "en"
        assert result["labels"]["en"]["value"] == "Albert Einstein"

    def test_converts_descriptions(self, sample_wikidata_entity: dict[str, Any]) -> None:
        """Test that descriptions are correctly converted."""
        result = convert_wikidata_to_wikibase(sample_wikidata_entity)

        assert "descriptions" in result
        assert "en" in result["descriptions"]
        assert "German-born" in result["descriptions"]["en"]["value"]

    def test_converts_aliases(self, sample_wikidata_entity: dict[str, Any]) -> None:
        """Test that aliases are correctly converted."""
        result = convert_wikidata_to_wikibase(sample_wikidata_entity)

        assert "aliases" in result
        assert "en" in result["aliases"]
        assert len(result["aliases"]["en"]) == 2
        alias_values = [a["value"] for a in result["aliases"]["en"]]
        assert "Einstein" in alias_values

    def test_filters_by_language(self, sample_wikidata_entity: dict[str, Any]) -> None:
        """Test that only specified languages are included."""
        result = convert_wikidata_to_wikibase(
            sample_wikidata_entity,
            languages=["en"],
        )

        # German label should be excluded
        assert "de" not in result.get("labels", {})

    def test_handles_empty_entity(self) -> None:
        """Test handling of empty entity."""
        result = convert_wikidata_to_wikibase({})
        assert result == {}

    def test_handles_missing_labels(self) -> None:
        """Test handling of entity without labels."""
        entity = {"id": "Q1", "descriptions": {"en": {"language": "en", "value": "test"}}}
        result = convert_wikidata_to_wikibase(entity)

        assert "labels" not in result
        assert "descriptions" in result


class TestExtractEntityReferences:
    """Tests for extract_entity_references function."""

    def test_extracts_entity_ids_from_claims(self, sample_wikidata_entity: dict[str, Any]) -> None:
        """Test extraction of entity IDs from claims."""
        references = extract_entity_references(sample_wikidata_entity)

        assert "Q5" in references  # From P31 claim

    def test_returns_empty_set_for_no_claims(self) -> None:
        """Test handling of entity without claims."""
        entity: dict[str, Any] = {"id": "Q1", "labels": {}}
        references = extract_entity_references(entity)

        assert len(references) == 0

    def test_extracts_from_qualifiers(self) -> None:
        """Test extraction from qualifier values."""
        entity = {
            "claims": {
                "P31": [
                    {
                        "mainsnak": {
                            "datavalue": {"type": "wikibase-entityid", "value": {"id": "Q5"}},
                        },
                        "qualifiers": {
                            "P3831": [
                                {
                                    "datavalue": {
                                        "type": "wikibase-entityid",
                                        "value": {"id": "Q123"},
                                    },
                                },
                            ],
                        },
                    },
                ],
            },
        }
        references = extract_entity_references(entity)

        assert "Q5" in references
        assert "Q123" in references
