# Local infrastructure for THOS development.
#
# Start PostgreSQL:
#   docker compose -f infrastructure/local/docker-compose.yml up -d
#
# Connection string for Backend/.env:
#   THOS_DATABASE_URL=postgresql://thos:thos@localhost:5432/thos

See `docker-compose.yml` for the Postgres 17 service definition.
