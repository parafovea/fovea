---
sidebar_label: Operations
---

# Operations

Runbooks for deploying and running Fovea. Day-one and day-two
both live here.

## Day one

- [Production deployment](production-deployment.md) walks
  through standing up the six-container stack against a real
  database and storage volume.
- [demo.fovea.video deployment](demo-fovea-deployment.md)
  covers the public-demo flavor: tour demo mode, no model
  service, anonymous catalog at `/`.

## Day two

- [Monitoring](monitoring.md) describes the OpenTelemetry and
  Prometheus signals the stack already emits, what to alert on,
  and what is not instrumented.
- [Backup and restore](backup-restore.md) covers the Postgres
  dump and storage-volume sync that together constitute a
  complete backup, and the restore drill that catches gaps
  before they hurt.
- [Upgrades](upgrades.md) describes the patch, minor, and
  major upgrade paths, including Prisma migrate deploy and
  permission re-seeding.
- [Troubleshooting](troubleshooting.md) collects the failure
  modes operators have actually hit, organized by the symptom
  the user reports.

For configuration knobs (environment variables, Docker shape,
port matrix, model selection), see the
[Reference](../reference/index.md) section.
