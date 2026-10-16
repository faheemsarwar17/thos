# Local infrastructure

`docker-compose.yml` in this folder runs **PostgreSQL 17 with pgvector** (`pgvector/pgvector:pg17`) for THOS development.

```powershell
# from the repository root
docker compose -f infrastructure/local/docker-compose.yml up -d
docker compose -f infrastructure/local/docker-compose.yml ps
```

| Setting | Value |
| --- | --- |
| Container | `thos-postgres` (project `thos-local`) |
| User / password / database | `thos` / `thos` / `thos` |
| Host port | **5433** (mapped to container port 5432, so it doesn't clash with a local Postgres) |
| Volume | `thos-postgres-data` |

Connection string for `Backend/.env`:

```
THOS_DATABASE_URL=postgresql://thos:thos@localhost:5433/thos
```

The backend creates the schema on startup and enables the `vector` extension when it is available.

The optional LiveKit + Redis stack for voice interviews is in the repository-root `docker-compose.yml`.
