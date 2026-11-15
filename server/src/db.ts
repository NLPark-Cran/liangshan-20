/**
 * 数据库连接池与迁移。
 * 复用 VPS 上已有的 PostgreSQL 17，不另起实例。
 */
import pg from 'pg';

const { Pool } = pg;

export const pool = new Pool({
  host: process.env.PGHOST || '/var/run/postgresql',
  port: Number(process.env.PGPORT || 5432),
  user: process.env.PGUSER || 'liangshan',
  password: process.env.PGPASSWORD || undefined,
  database: process.env.PGDATABASE || 'liangshan',
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('[db] idle client error', err.message);
});

/** 一次性迁移：建表 + 索引。幂等，可反复执行。 */
export async function migrate(): Promise<void> {
  const sql = `
  CREATE TABLE IF NOT EXISTS users (
    id           BIGSERIAL PRIMARY KEY,
    kind         TEXT NOT NULL CHECK (kind IN ('guest', 'member')),
    handle       TEXT NOT NULL UNIQUE,
    nickname     TEXT NOT NULL,
    password_hash TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE INDEX IF NOT EXISTS users_kind_idx ON users (kind);

  CREATE TABLE IF NOT EXISTS bird_logs (
    id         BIGSERIAL PRIMARY KEY,
    user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    site_id    TEXT NOT NULL,
    site_name  TEXT NOT NULL,
    species    TEXT NOT NULL,
    rarity     TEXT NOT NULL,
    count_text TEXT NOT NULL,
    observed_at TEXT NOT NULL,
    weather    TEXT NOT NULL,
    wind       TEXT NOT NULL,
    typhoon    BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE INDEX IF NOT EXISTS bird_logs_user_idx ON bird_logs (user_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS bird_logs_user_species_idx ON bird_logs (user_id, species);

  CREATE TABLE IF NOT EXISTS ledger_runs (
    id            BIGSERIAL PRIMARY KEY,
    user_id       BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    closed_year   INT,
    final_year    INT NOT NULL,
    final_cash    INT NOT NULL,
    final_mountain INT NOT NULL,
    years_json    JSONB NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE INDEX IF NOT EXISTS ledger_runs_user_idx ON ledger_runs (user_id, created_at DESC);

  CREATE TABLE IF NOT EXISTS tern_runs (
    id          BIGSERIAL PRIMARY KEY,
    user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    seasons     INT NOT NULL,
    total_chicks INT NOT NULL,
    success_years INT NOT NULL,
    detail_json JSONB NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE INDEX IF NOT EXISTS tern_runs_user_idx ON tern_runs (user_id, created_at DESC);
  `;

  await pool.query(sql);
  console.log('[db] migrate ok');
}
