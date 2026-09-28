-- The old hand-written migration runner is retired. Prisma now owns migration state.
DROP TABLE IF EXISTS "schema_migrations";
