/**
 * Express Application Setup
 */

const express = require('express');
const walletRoutes = require('./routes/walletRoutes');
const errorHandler = require('./middleware/errorHandler');

const app = express();

// ── Middleware ──
app.use(express.json());

// ── Health Check ──
app.get('/api/health', (_req, res) => {
    res.json({
        status: 'ok',
        service: 'dino-wallet-service',
        timestamp: new Date().toISOString(),
    });
});

// ── Routes ──
app.use('/api/wallets', walletRoutes);

// ── 404 ──
app.use((_req, res) => {
    res.status(404).json({ success: false, error: 'Route not found' });
});

// ── Error Handler ──
app.use(errorHandler);

module.exports = app;
