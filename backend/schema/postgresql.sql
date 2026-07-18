-- Space Client — Stardust progression & Cosmic Shop (PostgreSQL)
-- Mirrors the JSON player store in lib/player-db.js for production deployments.

CREATE TABLE IF NOT EXISTS users (
  uuid              CHAR(32) PRIMARY KEY,
  username          VARCHAR(64),
  credits           INTEGER NOT NULL DEFAULT 0,
  space_plus        BOOLEAN NOT NULL DEFAULT FALSE,
  space_plus_interval VARCHAR(16),
  stripe_customer_id VARCHAR(64),
  stardust          INTEGER NOT NULL DEFAULT 0,
  stardust_lifetime INTEGER NOT NULL DEFAULT 0,
  stardust_daily_earned INTEGER NOT NULL DEFAULT 0,
  stardust_daily_date DATE,
  cosmic_pass_xp    INTEGER NOT NULL DEFAULT 0,
  cosmic_pass_level INTEGER NOT NULL DEFAULT 1,
  total_active_ms   BIGINT NOT NULL DEFAULT 0,
  equipped_cosmetics JSONB NOT NULL DEFAULT '{"capes":null,"pets":null,"titles":null,"icons":null}',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS owned_cosmetics (
  uuid        CHAR(32) NOT NULL REFERENCES users(uuid) ON DELETE CASCADE,
  cosmetic_id VARCHAR(64) NOT NULL,
  source      VARCHAR(32) NOT NULL DEFAULT 'stardust',
  claimed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (uuid, cosmetic_id)
);

CREATE TABLE IF NOT EXISTS play_sessions (
  id              UUID PRIMARY KEY,
  uuid            CHAR(32) NOT NULL REFERENCES users(uuid) ON DELETE CASCADE,
  instance_id     VARCHAR(64),
  started_at      TIMESTAMPTZ NOT NULL,
  ended_at        TIMESTAMPTZ,
  active_ms       INTEGER NOT NULL DEFAULT 0,
  stardust_earned INTEGER NOT NULL DEFAULT 0,
  heartbeat_count INTEGER NOT NULL DEFAULT 0,
  crashed         BOOLEAN NOT NULL DEFAULT FALSE,
  synced_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_play_sessions_uuid ON play_sessions(uuid);
CREATE INDEX IF NOT EXISTS idx_play_sessions_started ON play_sessions(started_at DESC);

CREATE TABLE IF NOT EXISTS progression_sync_log (
  id           BIGSERIAL PRIMARY KEY,
  uuid         CHAR(32) NOT NULL,
  session_id   UUID NOT NULL,
  active_ms    INTEGER NOT NULL,
  stardust_delta INTEGER NOT NULL,
  jwt_iat      TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
