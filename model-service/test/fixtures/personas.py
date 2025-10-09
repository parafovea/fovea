"""
Test fixtures for persona-related data.
Provides factory functions for creating test personas and ontologies.
"""

from typing import Any


def create_persona(overrides: dict[str, Any] | None = None) -> dict[str, Any]:
    """
    Factory function to create test persona objects.

    Args:
        overrides: Partial persona properties to override defaults

    Returns:
        A complete persona dictionary for testing

    Example:
        ```python
        persona = create_persona({"name": "Baseball Scout"})
        ```
    """
    persona = {
        "id": "test-persona-1",
        "name": "Test Analyst",
        "role": "Intelligence Analyst",
        "information_need": "Analyze test scenarios",
        "created_at": "2025-10-01T10:00:00Z",
        "updated_at": "2025-10-01T10:00:00Z",
    }

    if overrides:
        persona.update(overrides)

    return persona


def create_entity_type(overrides: dict[str, Any] | None = None) -> dict[str, Any]:
    """
    Factory function to create test entity type objects.

    Args:
        overrides: Partial entity type properties to override defaults

    Returns:
        A complete entity type dictionary for testing

    Example:
        ```python
        entity_type = create_entity_type({"name": "Player"})
        ```
    """
    entity_type = {
        "id": "test-entity-type-1",
        "name": "Test Entity",
        "description": "A test entity type",
        "parent": None,
        "properties": {},
        "wikidata_id": None,
    }

    if overrides:
        entity_type.update(overrides)

    return entity_type


def create_event_type(overrides: dict[str, Any] | None = None) -> dict[str, Any]:
    """
    Factory function to create test event type objects.

    Args:
        overrides: Partial event type properties to override defaults

    Returns:
        A complete event type dictionary for testing

    Example:
        ```python
        event_type = create_event_type({"name": "Home Run"})
        ```
    """
    event_type = {
        "id": "test-event-type-1",
        "name": "Test Event",
        "description": "A test event type",
        "parent": None,
        "properties": {},
        "wikidata_id": None,
    }

    if overrides:
        event_type.update(overrides)

    return event_type


def create_ontology(
    persona_id: str = "test-persona-1",
    entity_types: list[dict[str, Any]] | None = None,
    event_types: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """
    Factory function to create test ontology objects.

    Args:
        persona_id: Persona ID for the ontology
        entity_types: List of entity types (uses default if None)
        event_types: List of event types (uses default if None)

    Returns:
        A complete ontology dictionary for testing

    Example:
        ```python
        ontology = create_ontology(
            persona_id="baseball-scout",
            entity_types=[create_entity_type({"name": "Pitcher"})]
        )
        ```
    """
    return {
        "id": "test-ontology-1",
        "persona_id": persona_id,
        "entity_types": entity_types or [create_entity_type()],
        "event_types": event_types or [create_event_type()],
        "role_types": [],
        "relation_types": [],
        "created_at": "2025-10-01T10:00:00Z",
        "updated_at": "2025-10-01T10:00:00Z",
    }


def create_baseball_scout_persona() -> dict[str, Any]:
    """
    Creates a baseball scout persona for domain-specific testing.

    Returns:
        Persona configured for baseball scouting

    Example:
        ```python
        scout_persona = create_baseball_scout_persona()
        ```
    """
    return create_persona(
        {
            "id": "baseball-scout",
            "name": "Baseball Scout",
            "role": "Professional Scout",
            "information_need": "Evaluate pitcher mechanics and performance",
        }
    )


def create_wildlife_researcher_persona() -> dict[str, Any]:
    """
    Creates a wildlife researcher persona for domain-specific testing.

    Returns:
        Persona configured for wildlife research

    Example:
        ```python
        researcher_persona = create_wildlife_researcher_persona()
        ```
    """
    return create_persona(
        {
            "id": "wildlife-researcher",
            "name": "Wildlife Researcher",
            "role": "Marine Biologist",
            "information_need": "Document whale pod behavior and migration patterns",
        }
    )
