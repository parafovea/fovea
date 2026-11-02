"""Encode deployment secrets as Compose environment values or a login request."""

import json
import os
import sys
from pathlib import Path


def write_environment(secrets: dict[str, str], destination: Path) -> None:
    """Replace secret assignments without evaluating their contents.

    Args:
        secrets: Environment names and their literal values.
        destination: Compose environment file to update.
    """
    lines = destination.read_text().splitlines() if destination.exists() else []
    retained = [line for line in lines if line.split("=", 1)[0] not in secrets]
    # Compose interpolates dollars inside double quotes. JSON escaping protects
    # quotes, backslashes and newlines; doubled dollars suppress interpolation.
    retained.extend(f"{key}={json.dumps(value).replace('$', '$$')}" for key, value in secrets.items())
    destination.write_text("\n".join(retained) + "\n")
    destination.chmod(0o600)


def main() -> None:
    """Write the requested environment file or JSON login payload."""
    os.umask(0o077)
    secrets = json.loads(Path(sys.argv[1]).read_text())
    if sys.argv[2] == "--login":
        Path(sys.argv[3]).write_text(json.dumps({"username": "admin", "password": secrets["ADMIN_PASSWORD"]}))
    else:
        write_environment(secrets, Path(sys.argv[2]))


if __name__ == "__main__":
    main()
