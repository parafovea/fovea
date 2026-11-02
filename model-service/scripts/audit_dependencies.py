"""Audit installed dependencies, mapping PyTorch CPU wheels to their public releases.

PyPI's advisory API does not recognize the +cpu local version identifier.
The corresponding public release identifies the upstream code to audit.
Only the editable application itself is excluded from the dependency scan.
"""

import subprocess
import sys
import tempfile
from importlib.metadata import distributions
from pathlib import Path


def audit_requirement(name: str, installed_version: str) -> str | None:
    """Return a pinned audit requirement, excluding only the application package."""
    normalized_name = name.lower().replace("_", "-")
    if normalized_name == "fovea-model-service":
        return None
    if normalized_name in {"torch", "torchvision"}:
        installed_version = installed_version.removesuffix("+cpu")
    return f"{normalized_name}=={installed_version}"


def main() -> int:
    """Audit the active environment without resolving or installing dependencies."""
    requirements = sorted(
        requirement
        for distribution in distributions()
        if (requirement := audit_requirement(distribution.name, distribution.version)) is not None
    )
    with tempfile.TemporaryDirectory(prefix="fovea-dependency-audit-") as directory:
        requirements_path = Path(directory) / "requirements.txt"
        requirements_path.write_text("\n".join(requirements) + "\n", encoding="utf-8")
        return subprocess.run(
            [
                sys.executable,
                "-m",
                "pip_audit",
                "--disable-pip",
                "--no-deps",
                "-r",
                str(requirements_path),
            ],
            check=False,
        ).returncode


if __name__ == "__main__":
    sys.exit(main())
