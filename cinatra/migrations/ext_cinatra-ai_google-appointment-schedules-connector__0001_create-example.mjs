// Example DB migration for @cinatra-ai/google-appointment-schedules-connector.
//
// This is a STANDARD node-pg-migrate ESM module. The host discovers it by the
// filename contract (`ext_<scope>_<slug>__NNNN_<short-description>.mjs`) declared
// through `cinatra.migrationsDir` in package.json — never by a static import —
// and applies it through the SHARED runner into the app schema's single
// `pgmigrations` ledger, partitioned to this connector's namespace
// (`ext_cinatra-ai_google-appointment-schedules-connector__`). The host only ever runs migrations UP (at install / boot /
// hot-activate); `down` is the operator-only rollback escape hatch.
//
// Contract you MUST keep (the host preflight rejects violations fail-closed):
//   - Filename: `ext_cinatra-ai_google-appointment-schedules-connector__NNNN_<short-description>.mjs` — NNNN is a
//     zero-padded, strictly increasing 4-digit sequence; the description is
//     lowercase kebab-case. Add the next migration as
//     `ext_cinatra-ai_google-appointment-schedules-connector__0002_<change>.mjs`, never edit a shipped one.
//   - Idempotent SQL: guard every statement with IF NOT EXISTS / IF EXISTS. The
//     ledger records an applied migration once, but the bootstrap path and
//     re-runs must stay safe.
//   - Namespace your objects: tables/indexes the host shares one app schema, so
//     prefix names with the SQL-safe prefix `ext_cinatra_ai_google_appointment_schedules_connector_` (the same identity as
//     the filename namespace, but dashes flattened to underscores — hyphens are
//     not valid in unquoted Postgres identifiers) to avoid colliding with core
//     or other extensions. Unqualified names ride the runner's search_path.
//
// Replace the example `*_items` table below with your connector's real schema.

/** @param {import("node-pg-migrate").MigrationBuilder} pgm */
export function up(pgm) {
  pgm.sql(`CREATE TABLE IF NOT EXISTS ext_cinatra_ai_google_appointment_schedules_connector_items (
  org_id text NOT NULL,
  id text PRIMARY KEY,
  name text,
  created_at timestamptz NOT NULL DEFAULT now()
);`);
  pgm.sql(
    `CREATE INDEX IF NOT EXISTS ext_cinatra_ai_google_appointment_schedules_connector_items_org_idx ON ext_cinatra_ai_google_appointment_schedules_connector_items (org_id);`,
  );
}

/** @param {import("node-pg-migrate").MigrationBuilder} pgm */
export function down(pgm) {
  pgm.sql(`DROP TABLE IF EXISTS ext_cinatra_ai_google_appointment_schedules_connector_items;`);
}
