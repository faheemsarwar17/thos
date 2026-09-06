---
kind: external_dependency
name: PostgreSQL with pgvector for embeddings
slug: postgresql-pgvector
category: external_dependency
category_hints:
    - vendor_identity
    - client_constraint
scope:
    - '**'
---

Local development runs PostgreSQL 17 with the pgvector extension (image pgvector/pgvector:pg17) to store and query vector embeddings for CV-to-job matching. The backend connects via THOS_DATABASE_URL; when unset it falls back to SQLite (database_path). Production should run the same pgvector image because similarity search depends on the extension.
- Client constraint: queries that rely on vector similarity will fail silently or return wrong results if the database lacks pgvector.