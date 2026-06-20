const express = require('express');
const { verifyPayoutPayload } = require('./api/payout-verify');
const { createNotificationProcessor } = require('./api/payout-notification');

const createApp = (config) => {
  const app = express();
  const { processPayoutNotification } = createNotificationProcessor({
    store: config.notificationStore,
  });

  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.status(200).json({ ok: true });
  });

  app.post('/securex/payout-verify', (req, res) => {
    const receivedToken = req.header('AccessToken') || req.header('Authorization');
    const normalizedToken = receivedToken?.startsWith('Bearer ')
      ? receivedToken.slice('Bearer '.length).trim()
      : receivedToken?.trim();
    const expectedToken = config.ozowAccessToken.trim();

    if (!expectedToken || normalizedToken !== expectedToken) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!config.ozowApiKey) {
      return res.status(500).json({ error: 'Server misconfigured: missing OZOW_API_KEY' });
    }

    if (!config.ozowAccountNumberDecryptionKey) {
      return res.status(500).json({
        error: 'Server misconfigured: missing OZOW_ACCOUNT_NUMBER_DECRYPTION_KEY',
      });
    }

    const result = verifyPayoutPayload(req.body || {}, config);
    return res.status(result.statusCode).json(result.body);
  });

  app.post('/securex/payout-notification', async (req, res) => {
    const receivedToken = req.header('AccessToken') || req.header('Authorization');
    const normalizedToken = receivedToken?.startsWith('Bearer ')
      ? receivedToken.slice('Bearer '.length).trim()
      : receivedToken?.trim();
    const expectedToken = config.ozowAccessToken.trim();

    if (!expectedToken || normalizedToken !== expectedToken) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!config.ozowApiKey) {
      return res.status(500).json({ error: 'Server misconfigured: missing OZOW_API_KEY' });
    }

    const result = await processPayoutNotification(req.body || {}, config);
    return res.status(result.statusCode).json(result.body);
  });

  return app;
};

const startServer = (config) => {
  const app = createApp(config);
  app.listen(config.port, () => {
    console.info(`SecureX API running on port ${config.port}`);
  });
};

module.exports = {
  createApp,
  startServer,
};
