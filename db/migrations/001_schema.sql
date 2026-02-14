-- ============================================================
-- Dino Ventures — Internal Wallet Service
-- Schema Migration 001
-- ============================================================

-- 1. Asset Types (virtual currencies in the platform)
CREATE TABLE IF NOT EXISTS asset_types (
    id          SERIAL PRIMARY KEY,
    code        VARCHAR(32) UNIQUE NOT NULL,
    name        VARCHAR(64) NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Users (regular users + system accounts like Treasury)
CREATE TABLE IF NOT EXISTS users (
    id          SERIAL PRIMARY KEY,
    username    VARCHAR(64) UNIQUE NOT NULL,
    user_type   VARCHAR(16) NOT NULL DEFAULT 'user'
                CHECK (user_type IN ('user', 'system')),
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Wallets — one per (user, asset_type), with cached balance
CREATE TABLE IF NOT EXISTS wallets (
    id            SERIAL PRIMARY KEY,
    user_id       INT NOT NULL REFERENCES users(id),
    asset_type_id INT NOT NULL REFERENCES asset_types(id),
    balance       BIGINT NOT NULL DEFAULT 0
                  CHECK (balance >= 0),
    created_at    TIMESTAMPTZ DEFAULT NOW(),
    updated_at    TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, asset_type_id)
);

-- 4. Ledger Entries — double-entry bookkeeping
--    Every transaction produces exactly 2 rows: one DEBIT, one CREDIT.
--    SUM(CREDIT amounts) == SUM(DEBIT amounts) across the entire table.
CREATE TABLE IF NOT EXISTS ledger_entries (
    id              BIGSERIAL PRIMARY KEY,
    transaction_id  UUID NOT NULL,
    wallet_id       INT NOT NULL REFERENCES wallets(id),
    entry_type      VARCHAR(8) NOT NULL
                    CHECK (entry_type IN ('DEBIT', 'CREDIT')),
    amount          BIGINT NOT NULL CHECK (amount > 0),
    balance_after   BIGINT NOT NULL,
    description     VARCHAR(256),
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ledger_txn
    ON ledger_entries(transaction_id);

CREATE INDEX IF NOT EXISTS idx_ledger_wallet
    ON ledger_entries(wallet_id, created_at);

-- 5. Idempotency Keys — prevents duplicate transaction processing
CREATE TABLE IF NOT EXISTS idempotency_keys (
    key             VARCHAR(128) PRIMARY KEY,
    response_code   INT NOT NULL,
    response_body   JSONB NOT NULL,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);
