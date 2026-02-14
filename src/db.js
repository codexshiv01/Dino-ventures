/**
 * Database Connection Pool
 * Uses node-postgres (pg) with SSL for Neon.
 */

const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 20,                // max connections in the pool
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
    console.error('💥 Unexpected pool error:', err.message);
});

module.exports = pool;
