/**
 * Wallet Service — Core transactional logic
 *
 * Implements double-entry ledger with:
 *   • SELECT ... FOR UPDATE (row-level locking)
 *   • Consistent lock ordering by wallet ID (deadlock avoidance 🌟)
 *   • Idempotency key checks inside the same transaction
 */

const { v4: uuidv4 } = require('uuid');
const pool = require('../db');

// ─── Helpers (run inside caller's transaction client) ─────

/**
 * Resolve a wallet ID for a given user + asset code.
 */
async function resolveWalletId(client, userId, assetCode) {
    const { rows } = await client.query(
        `SELECT w.id
     FROM wallets w
     JOIN asset_types a ON a.id = w.asset_type_id
     WHERE w.user_id = $1 AND a.code = $2`,
        [userId, assetCode]
    );
    if (rows.length === 0) {
        const err = new Error(`Wallet not found for user ${userId} / asset ${assetCode}`);
        err.statusCode = 404;
        throw err;
    }
    return rows[0].id;
}

/**
 * Resolve the Treasury (system) wallet for a given asset code.
 */
async function resolveTreasuryWalletId(client, assetCode) {
    const { rows } = await client.query(
        `SELECT w.id
     FROM wallets w
     JOIN users u ON u.id = w.user_id
     JOIN asset_types a ON a.id = w.asset_type_id
     WHERE u.user_type = 'system' AND a.code = $1
     LIMIT 1`,
        [assetCode]
    );
    if (rows.length === 0) {
        const err = new Error(`Treasury wallet not found for asset ${assetCode}`);
        err.statusCode = 500;
        throw err;
    }
    return rows[0].id;
}

// ─── Core Transfer ───────────────────────────────────────
// All 3 flows (topup, bonus, spend) converge here.
// Everything runs inside ONE database transaction.

async function executeTransfer({ flow, userId, assetCode, amount, idempotencyKey }) {
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // ── Step 1: Idempotency check ──
        if (idempotencyKey) {
            const { rows: existing } = await client.query(
                'SELECT response_code, response_body FROM idempotency_keys WHERE key = $1',
                [idempotencyKey]
            );
            if (existing.length > 0) {
                await client.query('COMMIT');
                return {
                    idempotent: true,
                    statusCode: existing[0].response_code,
                    body: existing[0].response_body,
                };
            }
        }

        // ── Resolve wallet IDs (inside the same transaction) ──
        const userWalletId = await resolveWalletId(client, userId, assetCode);
        const treasuryWalletId = await resolveTreasuryWalletId(client, assetCode);

        // Determine direction
        let sourceWalletId, destWalletId, description;
        if (flow === 'topup') {
            sourceWalletId = treasuryWalletId;
            destWalletId = userWalletId;
            description = `Top-up: ${amount} ${assetCode} purchased by user ${userId}`;
        } else if (flow === 'bonus') {
            sourceWalletId = treasuryWalletId;
            destWalletId = userWalletId;
            description = `Bonus: ${amount} ${assetCode} granted to user ${userId}`;
        } else {
            // spend
            sourceWalletId = userWalletId;
            destWalletId = treasuryWalletId;
            description = `Spend: ${amount} ${assetCode} spent by user ${userId}`;
        }

        // ── Step 2: Lock wallets in consistent order (deadlock avoidance 🌟) ──
        const walletIds = [sourceWalletId, destWalletId].sort((a, b) => a - b);

        const { rows: lockedWallets } = await client.query(
            `SELECT id, balance FROM wallets WHERE id = ANY($1) ORDER BY id FOR UPDATE`,
            [walletIds]
        );

        const sourceWallet = lockedWallets.find(w => w.id === sourceWalletId);
        const destWallet = lockedWallets.find(w => w.id === destWalletId);

        if (!sourceWallet || !destWallet) {
            const err = new Error('One or more wallets not found');
            err.statusCode = 404;
            throw err;
        }

        // ── Step 3: Validate sufficient balance ──
        const sourceBalance = BigInt(sourceWallet.balance);
        const transferAmount = BigInt(amount);

        if (sourceBalance < transferAmount) {
            const err = new Error(
                `Insufficient balance. Available: ${sourceBalance}, Requested: ${transferAmount}`
            );
            err.statusCode = 400;
            throw err;
        }

        // ── Step 4: Update balances ──
        const newSourceBalance = Number(sourceBalance - transferAmount);
        const newDestBalance = Number(BigInt(destWallet.balance) + transferAmount);

        await client.query(
            'UPDATE wallets SET balance = $1, updated_at = NOW() WHERE id = $2',
            [newSourceBalance, sourceWalletId]
        );
        await client.query(
            'UPDATE wallets SET balance = $1, updated_at = NOW() WHERE id = $2',
            [newDestBalance, destWalletId]
        );

        // ── Step 5: Insert ledger entries (double-entry 🌟) ──
        const transactionId = uuidv4();

        // DEBIT on source
        await client.query(
            `INSERT INTO ledger_entries (transaction_id, wallet_id, entry_type, amount, balance_after, description)
       VALUES ($1, $2, 'DEBIT', $3, $4, $5)`,
            [transactionId, sourceWalletId, amount, newSourceBalance, description]
        );

        // CREDIT on destination
        await client.query(
            `INSERT INTO ledger_entries (transaction_id, wallet_id, entry_type, amount, balance_after, description)
       VALUES ($1, $2, 'CREDIT', $3, $4, $5)`,
            [transactionId, destWalletId, amount, newDestBalance, description]
        );

        // ── Step 6: Store idempotency key ──
        const responseBody = {
            transactionId,
            sourceWalletId,
            destWalletId,
            amount,
            newSourceBalance,
            newDestBalance,
            description,
        };

        if (idempotencyKey) {
            await client.query(
                `INSERT INTO idempotency_keys (key, response_code, response_body)
         VALUES ($1, $2, $3)`,
                [idempotencyKey, 200, JSON.stringify(responseBody)]
            );
        }

        await client.query('COMMIT');

        return { idempotent: false, statusCode: 200, body: responseBody };
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}

// ─── Public API ──────────────────────────────────────────

/**
 * Top-up: User purchases credits with real money.
 * Treasury → User wallet
 */
async function topUp({ userId, assetCode, amount, idempotencyKey }) {
    return executeTransfer({ flow: 'topup', userId, assetCode, amount, idempotencyKey });
}

/**
 * Bonus: System issues free credits to a user.
 * Treasury → User wallet
 */
async function bonus({ userId, assetCode, amount, idempotencyKey }) {
    return executeTransfer({ flow: 'bonus', userId, assetCode, amount, idempotencyKey });
}

/**
 * Spend: User spends credits to buy an in-app service.
 * User wallet → Treasury
 */
async function spend({ userId, assetCode, amount, idempotencyKey }) {
    return executeTransfer({ flow: 'spend', userId, assetCode, amount, idempotencyKey });
}

/**
 * Get wallet balance for a user and asset.
 */
async function getBalance(userId, assetCode) {
    const { rows } = await pool.query(
        `SELECT w.balance, a.code AS asset_code, a.name AS asset_name
     FROM wallets w
     JOIN asset_types a ON a.id = w.asset_type_id
     WHERE w.user_id = $1 AND a.code = $2`,
        [userId, assetCode]
    );
    if (rows.length === 0) {
        const err = new Error(`Wallet not found for user ${userId} / asset ${assetCode}`);
        err.statusCode = 404;
        throw err;
    }
    return rows[0];
}

/**
 * Get all balances for a user (across all asset types).
 */
async function getAllBalances(userId) {
    const { rows } = await pool.query(
        `SELECT a.code AS asset_code, a.name AS asset_name, w.balance
     FROM wallets w
     JOIN asset_types a ON a.id = w.asset_type_id
     WHERE w.user_id = $1
     ORDER BY a.code`,
        [userId]
    );
    return rows;
}

/**
 * Get transaction history (ledger entries) for a user's wallet.
 */
async function getTransactions(userId, { assetCode, limit = 20, offset = 0 } = {}) {
    let query = `
    SELECT le.transaction_id, le.entry_type, le.amount, le.balance_after,
           le.description, le.created_at, a.code AS asset_code
    FROM ledger_entries le
    JOIN wallets w ON w.id = le.wallet_id
    JOIN asset_types a ON a.id = w.asset_type_id
    WHERE w.user_id = $1
  `;
    const params = [userId];

    if (assetCode) {
        params.push(assetCode);
        query += ` AND a.code = $${params.length}`;
    }

    query += ` ORDER BY le.created_at DESC`;

    params.push(limit);
    query += ` LIMIT $${params.length}`;

    params.push(offset);
    query += ` OFFSET $${params.length}`;

    const { rows } = await pool.query(query, params);
    return rows;
}

module.exports = { topUp, bonus, spend, getBalance, getAllBalances, getTransactions };
