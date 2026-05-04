# Install

Clone the repository and bring the stack up with the default CPU
profile:

```bash
git clone https://github.com/aaronstevenwhite/fovea.git
cd fovea
cp server/.env.example server/.env
docker compose up
```

The default profile starts six services. Wait until each reports
healthy:

```text
fovea-postgres-1        healthy
fovea-redis-1           healthy
fovea-otel-collector-1  running
fovea-backend-1         healthy
fovea-model-service-1   healthy
fovea-frontend-1        running
```

The backend runs `npx prisma migrate deploy` and the seed script
on startup. The seed creates the `admin` user (password from
`ADMIN_PASSWORD`, defaulting to `admin`) and a `test` user
(password from `TEST_USER_PASSWORD`, defaulting to `test123`).

## Confirm the stack

The frontend serves on port 3000:

```bash
curl -sI http://localhost:3000/ | head -1
# HTTP/1.1 200 OK
```

The backend health endpoint serves on port 3001:

```bash
curl -s http://localhost:3001/api/health
# {"status":"ok"}
```

The model service serves on port 8000:

```bash
curl -s http://localhost:8000/health
# {"status":"healthy"}
```

If any service is unhealthy, check the relevant log
(`docker compose logs backend`, `docker compose logs model-service`)
before continuing.

## Sign in

Open `http://localhost:3000/` in a browser. The login form accepts
the seeded credentials:

```text
username: admin
password: <ADMIN_PASSWORD or "admin">
```

The default mode is `multi-user` (`FOVEA_MODE=multi-user`). To run
without authentication for local exploration, set
`FOVEA_MODE=single-user` and restart. Multi-user mode is the
documented configuration; the rest of the tutorial assumes it. See
[Reference > Environment variables](../reference/environment-variables.md)
for the full list.

## Next

Continue to [First persona](02-first-persona.md) to create the
working persona this tutorial uses.
