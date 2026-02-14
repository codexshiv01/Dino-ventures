/**
 * Concurrency Stress Test
 *
 * Fires N parallel spend requests for the same user to verify:
 *   1. No race conditions (balance never goes negative)
 *   2. Idempotency works (duplicate keys return cached response)
 *   3. No deadlocks under contention
 *
 * Usage: npm run test:concurrency
 *   (Make sure the server is running on localhost:3000 and db is seeded)
 */

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const USER_ID = 2;           // shivansh
const ASSET_CODE = 'GOLD_COINS';
const AMOUNT_PER_SPEND = 10;
const CONCURRENT_REQUESTS = 50;

async function sendSpend(idempotencyKey) {
    const res = await fetch(`${BASE_URL}/api/wallets/spend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            userId: USER_ID,
            assetCode: ASSET_CODE,
            amount: AMOUNT_PER_SPEND,
            idempotencyKey,
        }),
    });
    const data = await res.json();
    return { status: res.status, data };
}

async function run() {
    console.log('='.repeat(60));
    console.log('🔥 Concurrency Stress Test');
    console.log(`   ${CONCURRENT_REQUESTS} parallel spend requests × ${AMOUNT_PER_SPEND} ${ASSET_CODE}`);
    console.log('='.repeat(60));

    // 1. Get initial balance
    const balanceBefore = await fetch(`${BASE_URL}/api/wallets/${USER_ID}/balance?assetCode=${ASSET_CODE}`)
        .then(r => r.json());
    console.log(`\n💰 Balance BEFORE: ${balanceBefore.data.balance}`);

    // 2. Fire all requests in parallel (each with unique idempotency key)
    const promises = [];
    for (let i = 0; i < CONCURRENT_REQUESTS; i++) {
        promises.push(sendSpend(`stress-test-${Date.now()}-${i}`));
    }

    const results = await Promise.all(promises);

    // 3. Tally results
    const succeeded = results.filter(r => r.status === 201).length;
    const failed = results.filter(r => r.status === 400).length;
    const other = results.filter(r => r.status !== 201 && r.status !== 400).length;

    console.log(`\n📊 Results:`);
    console.log(`   ✅ Succeeded: ${succeeded}`);
    console.log(`   ❌ Insufficient balance: ${failed}`);
    console.log(`   ⚠️  Other errors: ${other}`);

    // 4. Get final balance
    const balanceAfter = await fetch(`${BASE_URL}/api/wallets/${USER_ID}/balance?assetCode=${ASSET_CODE}`)
        .then(r => r.json());
    console.log(`\n💰 Balance AFTER: ${balanceAfter.data.balance}`);

    // 5. Verify math
    const expected = Number(balanceBefore.data.balance) - (succeeded * AMOUNT_PER_SPEND);
    const actual = Number(balanceAfter.data.balance);

    console.log(`\n🧮 Verification:`);
    console.log(`   Expected balance: ${expected}`);
    console.log(`   Actual balance:   ${actual}`);

    if (expected === actual && actual >= 0) {
        console.log(`\n🎉 TEST PASSED — No race conditions, balance is consistent!`);
    } else {
        console.log(`\n💥 TEST FAILED — Balance mismatch detected!`);
        process.exit(1);
    }

    // 6. Test idempotency: fire same key twice
    console.log(`\n${'='.repeat(60)}`);
    console.log('🔄 Idempotency Test — sending duplicate request...\n');

    const key = `idempotency-test-${Date.now()}`;
    const first = await sendSpend(key);
    const second = await sendSpend(key);

    console.log(`   1st request: status=${first.status}, idempotent=${first.data.idempotent}`);
    console.log(`   2nd request: status=${second.status}, idempotent=${second.data.idempotent}`);

    if (second.data.idempotent === true) {
        console.log(`\n🎉 IDEMPOTENCY PASSED — Duplicate request returned cached response!`);
    } else {
        console.log(`\n💥 IDEMPOTENCY FAILED — Duplicate was processed again!`);
        process.exit(1);
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log('✅ All tests passed!\n');
}

run().catch(err => {
    console.error('Test runner error:', err);
    process.exit(1);
});
