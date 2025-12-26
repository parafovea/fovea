"""Convert Wikidata entities to local Wikibase format.

This module provides functionality to convert entity data from Wikidata's
format to a format suitable for import into a local Wikibase instance.
"""

import logging
from typing import Any

logger = logging.getLogger(__name__)


def convert_wikidata_to_wikibase(
    entity: dict[str, Any],
    languages: list[str] | None = None,
    include_wikidata_sitelink: bool = True,
) -> dict[str, Any]:
    """Convert a Wikidata entity to Wikibase import format.

    Parameters
    ----------
    entity : dict[str, Any]
        The Wikidata entity data.
    languages : list[str] | None
        List of language codes to include. If None, includes all.
    include_wikidata_sitelink : bool
        If True, include a sitelink to wikidatawiki with the original Q ID.

    Returns
    -------
    dict[str, Any]
        Entity data formatted for Wikibase wbeditentity API.
    """
    if languages is None:
        languages = ["en", "es", "fr", "de", "zh", "ja", "ru", "pt", "it", "ar"]

    result: dict[str, Any] = {}

    # Convert labels
    if "labels" in entity:
        result["labels"] = _convert_terms(entity["labels"], languages)

    # Convert descriptions
    if "descriptions" in entity:
        result["descriptions"] = _convert_terms(entity["descriptions"], languages)

    # Convert aliases
    if "aliases" in entity:
        result["aliases"] = _convert_aliases(entity["aliases"], languages)

    # Add sitelink to wikidatawiki to preserve original Wikidata ID
    # This allows lookup by original Q ID
    if include_wikidata_sitelink and "id" in entity:
        wikidata_id = entity["id"]
        result["sitelinks"] = {
            "wikidatawiki": {
                "site": "wikidatawiki",
                "title": wikidata_id,
            }
        }

    # Note: We don't convert claims/statements because:
    # 1. Property IDs might not exist in the local Wikibase
    # 2. Entity references would need to be remapped
    # For a full import, you would need to also import properties and
    # create a mapping between Wikidata IDs and local Wikibase IDs

    return result


def _convert_terms(
    terms: dict[str, Any],
    languages: list[str],
) -> dict[str, dict[str, str]]:
    """Convert labels or descriptions to Wikibase format.

    Parameters
    ----------
    terms : dict[str, Any]
        Term data in Wikidata format.
    languages : list[str]
        Languages to include.

    Returns
    -------
    dict[str, dict[str, str]]
        Terms in Wikibase API format.
    """
    result: dict[str, dict[str, str]] = {}

    for lang, term_data in terms.items():
        if lang in languages:
            if isinstance(term_data, dict) and "value" in term_data:
                result[lang] = {
                    "language": lang,
                    "value": term_data["value"],
                }
            elif isinstance(term_data, str):
                result[lang] = {
                    "language": lang,
                    "value": term_data,
                }

    return result


def _convert_aliases(
    aliases: dict[str, Any],
    languages: list[str],
) -> dict[str, list[dict[str, str]]]:
    """Convert aliases to Wikibase format.

    Parameters
    ----------
    aliases : dict[str, Any]
        Alias data in Wikidata format.
    languages : list[str]
        Languages to include.

    Returns
    -------
    dict[str, list[dict[str, str]]]
        Aliases in Wikibase API format.
    """
    result: dict[str, list[dict[str, str]]] = {}

    for lang, alias_list in aliases.items():
        if lang in languages:
            converted: list[dict[str, str]] = []
            if isinstance(alias_list, list):
                for alias in alias_list:
                    if isinstance(alias, dict) and "value" in alias:
                        converted.append(
                            {
                                "language": lang,
                                "value": alias["value"],
                            }
                        )
                    elif isinstance(alias, str):
                        converted.append(
                            {
                                "language": lang,
                                "value": alias,
                            }
                        )
            if converted:
                result[lang] = converted

    return result


def _extract_entity_id_from_snak(snak: dict[str, Any]) -> str | None:
    """Extract entity ID from a snak's datavalue if it references an entity.

    Parameters
    ----------
    snak : dict[str, Any]
        A snak containing a datavalue.

    Returns
    -------
    str | None
        Entity ID if the datavalue is an entity reference, None otherwise.
    """
    datavalue = snak.get("datavalue", {})
    if datavalue.get("type") == "wikibase-entityid":
        entity_id: str | None = datavalue.get("value", {}).get("id")
        return entity_id
    return None


def extract_entity_references(entity: dict[str, Any]) -> set[str]:
    """Extract all entity references from claims.

    Parameters
    ----------
    entity : dict[str, Any]
        The entity data containing claims.

    Returns
    -------
    set[str]
        Set of referenced entity IDs.
    """
    references: set[str] = set()

    claims = entity.get("claims", {})
    for _prop_id, statements in claims.items():
        for statement in statements:
            # Check main value
            if entity_id := _extract_entity_id_from_snak(statement.get("mainsnak", {})):
                references.add(entity_id)

            # Check qualifiers
            for qual_statements in statement.get("qualifiers", {}).values():
                for qual in qual_statements:
                    if qual_id := _extract_entity_id_from_snak(qual):
                        references.add(qual_id)

            # Check references
            for ref in statement.get("references", []):
                for ref_statements in ref.get("snaks", {}).values():
                    for ref_snak in ref_statements:
                        if ref_id := _extract_entity_id_from_snak(ref_snak):
                            references.add(ref_id)

    return references
