"""Exercise deployment recovery with fake infrastructure commands."""

import importlib.util
import json
import os
import subprocess
import tempfile
import unittest
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parent


class DeploymentRecoveryTest(unittest.TestCase):
    """Ensure failed preparation restores service without deleting data."""

    def test_failed_deploy_restores_the_previous_application(self) -> None:
        """Preparation and startup failures restore the original application."""
        for failure in ("migration", "copy", "redis", "startup", "frontend"):
            with self.subTest(failure=failure), tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                (root / "scripts").mkdir()
                (root / "annotation-tool").mkdir()
                (root / "annotation-tool/nginx.demo.conf").write_text("synthetic")
                (root / "scripts/write-deploy-env.py").write_text((SCRIPTS / "write-deploy-env.py").read_text())
                (root / ".env").write_text("")
                (root / ".deploy-secrets.json").write_text(json.dumps({"ADMIN_PASSWORD": "synthetic"}))
                binary = root / "bin"
                binary.mkdir()
                docker = binary / "docker"
                docker.write_text('''#!/usr/bin/env python3
import json, os, sys
args = sys.argv[1:]
with open(os.environ['COMMAND_LOG'], 'a') as log:
    log.write(' '.join(args) + '\\n')
command = ' '.join(args)
if args[:3] == ['compose', 'ps', '-q']:
    print('previous-' + args[3])
elif args[0] == 'inspect':
    print(json.dumps([{'Image': 'sha256:previous', 'Config': {'Cmd': ['sh', '-c', 'exec old-server "$SESSION_SECRET"'], 'Entrypoint': None, 'Env': ['FOVEA_DEMO_MODE=false', 'SESSION_SECRET=previous-$literal-secret']}}]))
elif 'redis-cli ping' in command:
    print('PONG' if os.environ['FAIL_AT'] != 'redis' else 'FAILED')
elif 'pg_dump' in command:
    print('synthetic backup')
elif ('prisma migrate deploy' in command and os.environ['FAIL_AT'] == 'migration') or ('cli.cjs auto' in command and os.environ['FAIL_AT'] == 'copy'):
    sys.exit(1)
elif '--force-recreate' in args and os.environ['FAIL_AT'] == 'startup':
    sys.exit(1)
elif args[0] == 'start' and os.environ['FAIL_AT'] in ('startup', 'frontend'):
    sys.exit(1)
''')
                docker.chmod(0o755)
                for name, body in {"sleep": "exit 0", "flock": "exit 0", "df": "echo 999999999", "curl": 'case "$*" in *localhost:3000*) [ "$FAIL_AT" != frontend ];; *) exit 0;; esac'}.items():
                    script = binary / name
                    script.write_text("#!/bin/sh\n" + body + "\n")
                    script.chmod(0o755)
                log = root / "commands.log"
                environment = {**os.environ, "PATH": str(binary) + os.pathsep + os.environ["PATH"],
                               "FAIL_AT": failure, "COMMAND_LOG": str(log), "DEPLOY_BACKUP_DIR": str(root / "backups")}
                result = subprocess.run(["bash", str(SCRIPTS / "deploy-remote.sh"), str(root), "true"],
                                        env=environment, capture_output=True, text=True, timeout=20)
                self.assertNotEqual(result.returncode, 0)
                self.assertTrue(log.exists(), result.stdout + result.stderr)
                commands = log.read_text()
                self.assertIn("start previous-backend", commands, result.stderr)
                self.assertNotIn("volume rm", commands)
                self.assertNotIn("compose down", commands)
                if failure not in ("frontend", "startup"):
                    self.assertNotIn("--force-recreate", commands)
                else:
                    self.assertIn("--force-recreate", commands, result.stdout + result.stderr)
                    self.assertIn("compose -f docker-compose.yml -f .deploy-rollback.json up -d --no-deps --no-build backend frontend", commands)
                if failure == "frontend":
                    self.assertIn("Frontend did not become healthy", result.stdout, result.stderr)
                rollback = root / ".deploy-rollback.json"
                previous = json.loads(rollback.read_text())["services"]["backend"]
                self.assertEqual(previous["environment"]["SESSION_SECRET"], "previous-$$literal-secret")
                self.assertEqual(previous["command"], ['sh', '-c', 'exec old-server "$$SESSION_SECRET"'])
                self.assertEqual(rollback.stat().st_mode & 0o777, 0o600)
                self.assertFalse((root / ".deploy-secrets.json").exists())

    def test_environment_and_login_encoding_preserves_literal_values(self) -> None:
        """Secret punctuation is serialized as data for Compose and JSON."""
        spec = importlib.util.spec_from_file_location("deploy_env", SCRIPTS / "write-deploy-env.py")
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        value = "a&/'\"$HOME`command`\\backslash\nnewline"
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            environment = root / ".env"
            environment.write_text("UNCHANGED=yes\nADMIN_PASSWORD=old\n")
            module.write_environment({"ADMIN_PASSWORD": value}, environment)
            encoded = environment.read_text().splitlines()[1].split("=", 1)[1]
            self.assertEqual(json.loads(encoded).replace("$$", "$"), value)
            self.assertEqual(environment.stat().st_mode & 0o777, 0o600)
            secret_file = root / "secrets.json"
            secret_file.write_text(json.dumps({"ADMIN_PASSWORD": value}))
            login = root / "login.json"
            subprocess.run(["python3", str(SCRIPTS / "write-deploy-env.py"), str(secret_file), "--login", str(login)], check=True)
            self.assertEqual(json.loads(login.read_text())["password"], value)


if __name__ == "__main__":
    unittest.main()
