const { Pool } = require('pg');

const createInMemoryNotificationStore = () => {
  const processedEvents = new Set();

  return {
    async initialize() {
      return;
    },
    async handleNotification({ eventKey, hashValid }) {
      if (!hashValid) {
        return { duplicate: false };
      }

      const duplicate = processedEvents.has(eventKey);
      if (!duplicate) {
        processedEvents.add(eventKey);
      }

      return { duplicate };
    },
  };
};

const createPostgresNotificationStore = (connectionString, sslEnabled) => {
  const pool = new Pool({
    connectionString,
    ssl: sslEnabled ? { rejectUnauthorized: false } : undefined,
  });

  const initialize = async () => {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS processed_webhook_events (
        event_key TEXT PRIMARY KEY,
        payout_id TEXT NOT NULL,
        status INTEGER NOT NULL,
        sub_status INTEGER NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS payout_notifications (
        id BIGSERIAL PRIMARY KEY,
        event_key TEXT,
        payout_id TEXT NOT NULL,
        site_code TEXT,
        merchant_reference TEXT,
        customer_merchant_reference TEXT,
        status INTEGER,
        sub_status INTEGER,
        hash_valid BOOLEAN NOT NULL,
        duplicate BOOLEAN NOT NULL,
        reason TEXT,
        raw_payload JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS payouts (
        payout_id TEXT PRIMARY KEY,
        site_code TEXT,
        merchant_reference TEXT,
        customer_merchant_reference TEXT,
        last_status INTEGER,
        last_sub_status INTEGER,
        last_notification_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await pool.query(
      'CREATE INDEX IF NOT EXISTS idx_payout_notifications_payout_id ON payout_notifications (payout_id)'
    );
  };

  const handleNotification = async ({
    eventKey,
    payload,
    status,
    subStatus,
    hashValid,
    reason,
  }) => {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      let duplicate = false;

      if (hashValid) {
        const dedupeResult = await client.query(
          `
            INSERT INTO processed_webhook_events (event_key, payout_id, status, sub_status)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (event_key) DO NOTHING
            RETURNING event_key
          `,
          [eventKey, payload.payoutId, status, subStatus]
        );

        duplicate = dedupeResult.rowCount === 0;
      }

      await client.query(
        `
          INSERT INTO payout_notifications (
            event_key,
            payout_id,
            site_code,
            merchant_reference,
            customer_merchant_reference,
            status,
            sub_status,
            hash_valid,
            duplicate,
            reason,
            raw_payload
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb)
        `,
        [
          eventKey,
          payload.payoutId,
          payload.siteCode || null,
          payload.merchantReference || null,
          payload.customerMerchantReference || null,
          status,
          subStatus,
          hashValid,
          duplicate,
          reason || null,
          JSON.stringify(payload),
        ]
      );

      if (hashValid && !duplicate) {
        await client.query(
          `
            INSERT INTO payouts (
              payout_id,
              site_code,
              merchant_reference,
              customer_merchant_reference,
              last_status,
              last_sub_status,
              last_notification_at,
              updated_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
            ON CONFLICT (payout_id)
            DO UPDATE SET
              site_code = EXCLUDED.site_code,
              merchant_reference = EXCLUDED.merchant_reference,
              customer_merchant_reference = EXCLUDED.customer_merchant_reference,
              last_status = EXCLUDED.last_status,
              last_sub_status = EXCLUDED.last_sub_status,
              last_notification_at = NOW(),
              updated_at = NOW()
          `,
          [
            payload.payoutId,
            payload.siteCode || null,
            payload.merchantReference || null,
            payload.customerMerchantReference || null,
            status,
            subStatus,
          ]
        );
      }

      await client.query('COMMIT');
      return { duplicate };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  };

  return {
    initialize,
    handleNotification,
  };
};

const createNotificationStoreFromEnv = () => {
  const connectionString = process.env.DATABASE_URL || '';
  if (!connectionString) {
    return { store: createInMemoryNotificationStore(), usesDatabase: false };
  }

  const sslEnabled = process.env.DATABASE_SSL === 'true';
  return {
    store: createPostgresNotificationStore(connectionString, sslEnabled),
    usesDatabase: true,
  };
};

module.exports = {
  createNotificationStoreFromEnv,
};
