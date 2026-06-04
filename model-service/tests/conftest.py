"""Pytest configuration for the architecture-keyed registry test tree.

This conftest sits above the ``tests/infrastructure/...`` tree (parallel
to ``test/`` which hosts the legacy loader integration suite). It exists
purely to make ``src`` importable when pytest is invoked with ``tests/``
as the rootpath. The src layout is shared with the rest of the package
so a single ``sys.path`` entry pointing at the project root is enough.
"""

from __future__ import annotations

import sys
from pathlib import Path

_PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(_PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(_PROJECT_ROOT))
