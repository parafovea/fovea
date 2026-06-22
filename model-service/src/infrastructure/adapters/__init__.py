"""Infrastructure adapters.

This package contains adapter implementations that connect the application
to external systems. Follows hexagonal architecture with inbound (driving)
and outbound (driven) adapters.

Subpackages
-----------
inbound
    Adapters that drive the application (e.g., FastAPI routes).
outbound
    Adapters that the application drives (e.g., ML models, external APIs).

Subpackages are imported by their concrete paths rather than re-exported
here, so importing one adapter subpackage does not force-load its siblings
(and the heavy ML dependencies they pull in).
"""

__all__: list[str] = []
