# Dino Ventures — Internal Wallet Service

A production-grade internal wallet service for a gaming/loyalty platform. Manages virtual currencies (Gold Coins, Diamonds, Loyalty Points) using a **double-entry ledger** with full **concurrency safety** and **idempotency**.

## 🚀 Quick Start

### Prerequisites
- **Node.js** 20+
- **PostgreSQL** — any PostgreSQL instance (local, Docker, or cloud like [Neon](https://neon.tech), [Supabase](https://supabase.com), AWS RDS, etc.)

### 1. Configure Environment

Create a `.env` file in the project root:

```bash
cp .env.example .env
```

Then set your PostgreSQL connection string:

```env
DATABASE_URL=postgresql://<user>:<password>@<host>:<port>/<database>?sslmode=require
PORT=3000
```

> **Example** (using a free Neon database):
> ```
> DATABASE_URL=postgresql://myuser:mypass@ep-xyz.us-east-1.aws.neon.tech/mydb?sslmode=require
> ```
> **Example** (using a local PostgreSQL):
> ```
> DATABASE_URL=postgresql://postgres:postgres@localhost:5432/wallet_db
> ```

### 2. Run — Option A: Local (without Docker)

```bash
# Install dependencies
npm install

# Create tables + insert seed data (runs migrations/001_schema.sql + seed.sql)
npm run db:setup

# Start the server
npm run dev
# → Server runs on http://localhost:3000
```

### 2. Run — Option B: Docker

> The `DATABASE_URL` i have already pre-configured in `docker-compose.yml`, so no `.env` setup is needed for Docker.

```bash
# Seed the database (one-time)
npm install
npm run db:setup

# Build & start the container
docker-compose up --build
# → Server runs on http://localhost:3000
```

---

## 🏗️ Technology Choices

| Technology | Rationale |
|---|---|
| **Node.js + Express** | Async-first runtime, ideal for high-concurrency I/O. Fast development cycle. |
| **PostgreSQL (Neon)** | First-class ACID transaction support, `SELECT ... FOR UPDATE` for row-level locking, cloud-hosted for zero-ops. |
| **node-postgres (`pg`)** | Direct SQL control — no ORM hiding critical transaction logic. Full visibility into every query. |
| **Docker** | One-command deployment. Reproducible builds across environments. |

---

## 🏛️ Architecture: Double-Entry Ledger

Instead of naively updating a `balance` column, every transaction creates exactly **two ledger entries**:

| Entry | Wallet | Effect |
|---|---|---|
| **DEBIT** | Source wallet | Balance decreases |
| **CREDIT** | Destination wallet | Balance increases |

This guarantees:
- **Auditability**: Every credit ever added or spent is recorded with a transaction ID
- **Reconstructability**: Any wallet's balance can be recomputed from `SUM(CREDIT) - SUM(DEBIT)`
- **Integrity**: `SUM(all DEBITs)` = `SUM(all CREDITs)` across the entire system

### Example: User spends 100 Gold Coins

```
Transaction ID: 3f8a...b2c1
┌──────────────────────────────────────────────────────┐
│ DEBIT   | User Wallet (id=4)    | -100 | balance: 900 │
│ CREDIT  | Treasury Wallet (id=1)| +100 | balance: ... │
└──────────────────────────────────────────────────────┘
```

---

## 🔒 Concurrency Strategy

### Problem
Under high traffic, two concurrent requests might both read a balance of 100, both pass the "sufficient balance" check, and both deduct — resulting in a negative balance.

### Solution: `SELECT ... FOR UPDATE` with Consistent Lock Ordering

```sql
-- Inside a transaction:
SELECT id, balance FROM wallets
WHERE id = ANY($1)
ORDER BY id        -- ⚡ Consistent ordering prevents deadlocks
FOR UPDATE;        -- 🔒 Row-level lock until COMMIT
```

**How it works:**
1. When a transaction touches wallets (e.g., IDs 3 and 7), it **always locks ID 3 first, then 7**
2. If another transaction needs wallets 7 and 3, it also locks 3 first — so it **waits** instead of creating a deadlock
3. Once locked, the balance check and update are atomic — no concurrent reader can see stale data

**Why `ORDER BY id`?**
Deadlocks occur when Transaction A holds lock X and waits for Y, while Transaction B holds Y and waits for X. By always locking in ascending ID order, this circular wait is **impossible**.

---

## 🔄 Idempotency Strategy

### Problem
Network failures can cause clients to retry requests. Without idempotency, a retry could credit a user twice.

### Solution: Idempotency Keys

Every mutating request requires a client-provided `idempotencyKey`. The system:

1. **Checks** if the key exists in `idempotency_keys` table
2. If **yes** → returns the cached response (no side effects)
3. If **no** → processes the transaction and stores the key + response

The key check and insert happen **inside the same database transaction** as the balance update, so there's no window for duplicates.

---

## 📡 API Reference

### Health Check
```
GET /api/health
```

### Wallet Top-up (User buys credits)
```bash
POST /api/wallets/topup
Content-Type: application/json

{
  "userId": 2,
  "assetCode": "GOLD_COINS",
  "amount": 500,
  "idempotencyKey": "topup-shivansh-001"
}
```

### Bonus (System grants free credits)
```bash
POST /api/wallets/bonus
Content-Type: application/json

{
  "userId": 3,
  "assetCode": "DIAMONDS",
  "amount": 100,
  "idempotencyKey": "bonus-lokendra-001"
}
```

### Spend (User buys in-app item)
```bash
POST /api/wallets/spend
Content-Type: application/json

{
  "userId": 2,
  "assetCode": "GOLD_COINS",
  "amount": 200,
  "idempotencyKey": "spend-shivansh-001"
}
```

### Check Balance
```bash
# Single asset
GET /api/wallets/2/balance?assetCode=GOLD_COINS

# All assets for a user
GET /api/wallets/2/balance
```

### Transaction History
```bash
GET /api/wallets/2/transactions?limit=20&offset=0&assetCode=GOLD_COINS
```

---

## 📁 Project Structure

```
├── docker-compose.yml       # Container orchestration
├── Dockerfile               # Application container
├── package.json
├── db/
│   ├── migrations/
│   │   └── 001_schema.sql   # Tables: asset_types, users, wallets, ledger_entries, idempotency_keys
│   └── seed.sql             # Pre-seed: 3 assets, Treasury, shivansh & lokendra
├── scripts/
│   └── dbSetup.js           # Run migrations + seed
├── src/
│   ├── server.js            # Entry point
│   ├── app.js               # Express setup
│   ├── db.js                # PostgreSQL connection pool
│   ├── services/
│   │   └── walletService.js # Core: double-entry ledger, concurrency, idempotency
│   ├── routes/
│   │   └── walletRoutes.js  # REST endpoints
│   └── middleware/
│       └── errorHandler.js  # Global error handler
└── test/
    └── concurrency-test.js  # 50 parallel requests stress test
```

---

## 🧪 Testing

### Run Concurrency Stress Test
```bash
# Start the server first, then in another terminal:
npm run test:concurrency
```

This fires **50 parallel spend requests** and verifies:
- ✅ No race conditions (balance never goes negative)
- ✅ Idempotency works (duplicate keys return cached response)
- ✅ No deadlocks under contention
- ✅ Final balance matches expected value

---

## 📊 Database Schema

```
asset_types         users              wallets
┌──────────┐    ┌──────────┐    ┌─────────────────┐
│ id       │    │ id       │    │ id              │
│ code     │    │ username │    │ user_id → users │
│ name     │    │ user_type│    │ asset_type_id   │
└──────────┘    └──────────┘    │ balance (≥ 0)   │
                                └─────────────────┘
                                        │
                                ledger_entries
                                ┌─────────────────────┐
                                │ id                  │
                                │ transaction_id (UUID)│
                                │ wallet_id → wallets │
                                │ entry_type (D/C)    │
                                │ amount (> 0)        │
                                │ balance_after       │
                                │ description         │
                                └─────────────────────┘

idempotency_keys
┌──────────────────┐
│ key (PK)         │
│ response_code    │
│ response_body    │
└──────────────────┘
```
