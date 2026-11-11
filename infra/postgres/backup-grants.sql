-- Prepared for a NEW dedicated backup LOGIN, never for the runtime/migration identities.
-- Credentials must be provisioned separately by a secret manager, not a CLI variable.
\set ON_ERROR_STOP on
BEGIN;
SELECT current_database() = :'database_name' AS database_matches
\gset
\if :database_matches
\else
  \echo 'Refusing: connected database does not match the explicit target.'
  \quit 3
\endif
CREATE ROLE :"backup_role" LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
GRANT CONNECT ON DATABASE :"database_name" TO :"backup_role";
GRANT USAGE ON SCHEMA public TO :"backup_role";
GRANT SELECT ON ALL TABLES IN SCHEMA public TO :"backup_role";
GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO :"backup_role";
ALTER DEFAULT PRIVILEGES FOR ROLE :"owner_role" IN SCHEMA public GRANT SELECT ON TABLES TO :"backup_role";
ALTER DEFAULT PRIVILEGES FOR ROLE :"owner_role" IN SCHEMA public GRANT SELECT ON SEQUENCES TO :"backup_role";
COMMIT;
