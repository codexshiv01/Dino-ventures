/**
 * Database Setup Script
 * Runs migrations and seed data against the configured PostgreSQL database.
 * Usage: npm run db:setup
 */

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config();

async function run() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  try {
    console.log('🔌 Connecting to database...');

    // Run migration
    const migrationPath = path.join(__dirname, '..', 'db', 'migrations', '001_schema.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf-8');
    console.log('📦 Running schema migration...');
    await pool.query(migrationSQL);
    console.log('✅ Schema migration complete.');

    // Run seed
    const seedPath = path.join(__dirname, '..', 'db', 'seed.sql');
    const seedSQL = fs.readFileSync(seedPath, 'utf-8');
    console.log('🌱 Running seed data...');
    await pool.query(seedSQL);
    console.log('✅ Seed data inserted.');

    // Verify
    const { rows: users } = await pool.query('SELECT id, username, user_type FROM users ORDER BY id');
    console.log('\n👤 Users:', users);

    const { rows: wallets } = await pool.query(`
      SELECT w.id, u.username, a.code AS asset, w.balance
      FROM wallets w
      JOIN users u ON u.id = w.user_id
      JOIN asset_types a ON a.id = w.asset_type_id
      ORDER BY u.id, a.id
    `);
    console.log('💰 Wallets:', wallets);

    console.log('\n🎉 Database setup complete!');
  } catch (err) {
    console.error('❌ Database setup failed:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

run();
