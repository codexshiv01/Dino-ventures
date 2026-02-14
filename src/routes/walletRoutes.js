/**
 * Wallet Routes — RESTful API endpoints
 */

const express = require('express');
const router = express.Router();
const walletService = require('../services/walletService');

// ── Validation helper ──

function validateTransactionBody(req, res, next) {
    const { userId, assetCode, amount, idempotencyKey } = req.body;

    if (!userId || !assetCode || !amount) {
        return res.status(400).json({
            error: 'Missing required fields: userId, assetCode, amount',
        });
    }

    if (!Number.isInteger(amount) || amount <= 0) {
        return res.status(400).json({
            error: 'amount must be a positive integer',
        });
    }

    if (!idempotencyKey) {
        return res.status(400).json({
            error: 'Missing required field: idempotencyKey (required for safe retries)',
        });
    }

    next();
}

// ── POST /api/wallets/topup ──

router.post('/topup', validateTransactionBody, async (req, res, next) => {
    try {
        const { userId, assetCode, amount, idempotencyKey } = req.body;
        const result = await walletService.topUp({ userId, assetCode, amount, idempotencyKey });

        const status = result.idempotent ? 200 : 201;
        return res.status(status).json({
            success: true,
            idempotent: result.idempotent,
            data: result.body,
        });
    } catch (err) {
        next(err);
    }
});

// ── POST /api/wallets/bonus ──

router.post('/bonus', validateTransactionBody, async (req, res, next) => {
    try {
        const { userId, assetCode, amount, idempotencyKey } = req.body;
        const result = await walletService.bonus({ userId, assetCode, amount, idempotencyKey });

        const status = result.idempotent ? 200 : 201;
        return res.status(status).json({
            success: true,
            idempotent: result.idempotent,
            data: result.body,
        });
    } catch (err) {
        next(err);
    }
});

// ── POST /api/wallets/spend ──

router.post('/spend', validateTransactionBody, async (req, res, next) => {
    try {
        const { userId, assetCode, amount, idempotencyKey } = req.body;
        const result = await walletService.spend({ userId, assetCode, amount, idempotencyKey });

        const status = result.idempotent ? 200 : 201;
        return res.status(status).json({
            success: true,
            idempotent: result.idempotent,
            data: result.body,
        });
    } catch (err) {
        next(err);
    }
});

// ── GET /api/wallets/:userId/balance ──

router.get('/:userId/balance', async (req, res, next) => {
    try {
        const userId = parseInt(req.params.userId, 10);
        const { assetCode } = req.query;

        if (assetCode) {
            const balance = await walletService.getBalance(userId, assetCode);
            return res.json({ success: true, data: balance });
        }

        const balances = await walletService.getAllBalances(userId);
        return res.json({ success: true, data: balances });
    } catch (err) {
        next(err);
    }
});

// ── GET /api/wallets/:userId/transactions ──

router.get('/:userId/transactions', async (req, res, next) => {
    try {
        const userId = parseInt(req.params.userId, 10);
        const { assetCode, limit = 20, offset = 0 } = req.query;

        const transactions = await walletService.getTransactions(userId, {
            assetCode,
            limit: parseInt(limit, 10),
            offset: parseInt(offset, 10),
        });

        return res.json({ success: true, data: transactions });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
