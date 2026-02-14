/**
 * Server Entry Point
 */

require('dotenv').config();
const app = require('./app');

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`🚀 Dino Wallet Service running on http://localhost:${PORT}`);
    console.log(`   Health: http://localhost:${PORT}/api/health`);
});
