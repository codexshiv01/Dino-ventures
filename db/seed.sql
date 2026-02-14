-- ============================================================
-- Dino Ventures — Seed Data
-- ============================================================

-- 1. Asset Types
INSERT INTO asset_types (code, name) VALUES
    ('GOLD_COINS',     'Gold Coins'),
    ('DIAMONDS',       'Diamonds'),
    ('LOYALTY_POINTS', 'Loyalty Points')
ON CONFLICT (code) DO NOTHING;

-- 2. System Account (Treasury)
INSERT INTO users (username, user_type) VALUES
    ('treasury', 'system')
ON CONFLICT (username) DO NOTHING;

-- 3. User Accounts
INSERT INTO users (username, user_type) VALUES
    ('shivansh',  'user'),
    ('lokendra',  'user')
ON CONFLICT (username) DO NOTHING;

-- 4. Treasury Wallets (one per asset type, large initial supply)
INSERT INTO wallets (user_id, asset_type_id, balance)
SELECT u.id, a.id, 1000000000
FROM users u
CROSS JOIN asset_types a
WHERE u.username = 'treasury'
ON CONFLICT (user_id, asset_type_id) DO NOTHING;

-- 5. User Wallets with initial balances
--    Shivansh: 1000 Gold Coins, 500 Diamonds, 200 Loyalty Points
INSERT INTO wallets (user_id, asset_type_id, balance)
SELECT u.id, a.id,
    CASE a.code
        WHEN 'GOLD_COINS'     THEN 1000
        WHEN 'DIAMONDS'       THEN 500
        WHEN 'LOYALTY_POINTS' THEN 200
    END
FROM users u
CROSS JOIN asset_types a
WHERE u.username = 'shivansh'
ON CONFLICT (user_id, asset_type_id) DO NOTHING;

--    Lokendra: 750 Gold Coins, 300 Diamonds, 150 Loyalty Points
INSERT INTO wallets (user_id, asset_type_id, balance)
SELECT u.id, a.id,
    CASE a.code
        WHEN 'GOLD_COINS'     THEN 750
        WHEN 'DIAMONDS'       THEN 300
        WHEN 'LOYALTY_POINTS' THEN 150
    END
FROM users u
CROSS JOIN asset_types a
WHERE u.username = 'lokendra'
ON CONFLICT (user_id, asset_type_id) DO NOTHING;
