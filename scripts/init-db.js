require('dotenv').config();
const fs = require('fs');
const { createNotificationStoreFromEnv } = require('../src/db/notificationStore');

if (!process.env.DATABASE_URL && fs.existsSync('.env.example')) {
  require('dotenv').config({ path: '.env.example', override: false });
}

const run = async () => {
  const { store, usesDatabase } = createNotificationStoreFromEnv();

  if (!usesDatabase) {
    throw new Error('Missing DATABASE_URL. Set it in .env before running db:init.');
  }

  await store.initialize();
  console.info('PostgreSQL tables are ready.');
};

run().catch((error) => {
  console.error('DB initialization failed:', error.message);
  process.exitCode = 1;
});
