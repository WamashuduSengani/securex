require('dotenv').config();
const fs = require('fs');
const { startServer } = require('./server');
const { createNotificationStoreFromEnv } = require('./db/notificationStore');

if (
  (!process.env.OZOW_ACCESS_TOKEN ||
    !process.env.OZOW_API_KEY ||
    !process.env.OZOW_ACCOUNT_NUMBER_DECRYPTION_KEY) &&
  fs.existsSync('.env.example')
) {
  require('dotenv').config({ path: '.env.example', override: false });
}

const run = async () => {
  let { store: notificationStore, usesDatabase } = createNotificationStoreFromEnv();

  if (usesDatabase) {
    try {
      await notificationStore.initialize();
    } catch (error) {
      console.warn(`PostgreSQL init failed (${error.message}). Falling back to in-memory store.`);
      const originalUrl = process.env.DATABASE_URL;
      process.env.DATABASE_URL = '';
      ({ store: notificationStore, usesDatabase } = createNotificationStoreFromEnv());
      process.env.DATABASE_URL = originalUrl;
      await notificationStore.initialize();
    }
  } else {
    await notificationStore.initialize();
  }

  if (usesDatabase) {
    console.info('PostgreSQL notification store enabled.');
  } else {
    console.info('DATABASE_URL not set. Using in-memory notification store.');
  }

  startServer({
    port: process.env.PORT || 3000,
    ozowAccessToken: process.env.OZOW_ACCESS_TOKEN || '',
    ozowApiKey: process.env.OZOW_API_KEY || '',
    ozowAccountNumberDecryptionKey: process.env.OZOW_ACCOUNT_NUMBER_DECRYPTION_KEY || '',
    notificationStore,
  });
};

run().catch((error) => {
  console.error('Failed to start server:', error.message);
  process.exitCode = 1;
});
