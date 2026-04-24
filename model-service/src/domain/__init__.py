"""Domain layer.

This package contains pure business logic without external dependencies.
It defines entities, value objects, domain types, and domain exceptions
that form the core of the application.

Subpackages
-----------
entities
    Business entities with identity and lifecycle.
value_objects
    Immutable value types compared by value.
exceptions
    Domain-specific error conditions.

Modules
-------
types
    Literal type aliases for constrained string values.
"""

from src.domain import entities, exceptions, types, value_objects

__all__ = [
    "entities",
    "exceptions",
    "types",
    "value_objects",
]
