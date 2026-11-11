-- NEW isolated database only. Review with DBA; never run against production in this stage.
-- psql -X -v ON_ERROR_STOP=1 -v database_name=... -v owner_role=... -v migration_role=... -v runtime_role=... -f bootstrap.sql
-- No passwords in files/arguments. New LOGIN roles cannot authenticate until provisioned securely.
\set ON_ERROR_STOP on
BEGIN;
SELECT current_database() = :'database_name' AS database_matches,
  NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname NOT IN ('pg_catalog','information_schema') AND schemaname NOT LIKE 'pg_toast%') AS database_empty
\gset
\if :database_matches
\else
  \echo 'Refusing: connected database does not match the explicit target.'
  \quit 3
\endif
\if :database_empty
\else
  \echo 'Refusing: bootstrap requires a new empty database.'
  \quit 3
\endif
CREATE ROLE :"owner_role" NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE ROLE :"migration_role" LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE ROLE :"runtime_role" LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
GRANT :"owner_role" TO :"migration_role";
ALTER DATABASE :"database_name" OWNER TO :"owner_role";
REVOKE ALL ON DATABASE :"database_name" FROM PUBLIC;
GRANT CONNECT ON DATABASE :"database_name" TO :"migration_role", :"runtime_role";
REVOKE ALL ON SCHEMA public FROM PUBLIC;
ALTER SCHEMA public OWNER TO :"owner_role";
GRANT USAGE ON SCHEMA public TO :"runtime_role";
ALTER DEFAULT PRIVILEGES FOR ROLE :"owner_role" IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO :"runtime_role";
ALTER DEFAULT PRIVILEGES FOR ROLE :"owner_role" IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO :"runtime_role";
ALTER ROLE :"runtime_role" IN DATABASE :"database_name" SET statement_timeout = '15s';
ALTER ROLE :"runtime_role" IN DATABASE :"database_name" SET lock_timeout = '3s';
ALTER ROLE :"runtime_role" IN DATABASE :"database_name" SET idle_in_transaction_session_timeout = '60s';
COMMIT;
