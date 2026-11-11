-- Run after migration as DBA/schema owner, connected to the isolated target DB.
\set ON_ERROR_STOP on
BEGIN;
SELECT current_database() = :'database_name' AS database_matches
\gset
\if :database_matches
\else
  \echo 'Refusing: connected database does not match the explicit target.'
  \quit 3
\endif
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO :"runtime_role";
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO :"runtime_role";
REVOKE INSERT, UPDATE, DELETE ON django_migrations FROM :"runtime_role";
COMMIT;
