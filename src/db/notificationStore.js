const { PrismaClient } = require('@prisma/client');

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

const createPrismaNotificationStore = () => {
  const prisma = new PrismaClient();

  const initialize = async () => {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS processed_webhook_events (
        event_key TEXT PRIMARY KEY,
        payout_id TEXT NOT NULL,
        status INTEGER NOT NULL,
        sub_status INTEGER NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await prisma.$executeRawUnsafe(`
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

    await prisma.$executeRawUnsafe(`
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

    await prisma.$executeRawUnsafe(
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
    const payoutId = payload.payoutId || 'unknown';

    const result = await prisma.$transaction(async (tx) => {
      let duplicate = false;

      if (hashValid) {
        const inserted = await tx.processedWebhookEvent.createMany({
          data: [
            {
              eventKey,
              payoutId,
              status,
              subStatus,
            },
          ],
          skipDuplicates: true,
        });

        duplicate = inserted.count === 0;
      }

      await tx.payoutNotification.create({
        data: {
          eventKey,
          payoutId,
          siteCode: payload.siteCode || null,
          merchantReference: payload.merchantReference || null,
          customerMerchantReference: payload.customerMerchantReference || null,
          status,
          subStatus,
          hashValid,
          duplicate,
          reason: reason || null,
          rawPayload: payload,
        },
      });

      if (hashValid && !duplicate && payload.payoutId) {
        await tx.payout.upsert({
          where: {
            payoutId: payload.payoutId,
          },
          create: {
            payoutId: payload.payoutId,
            siteCode: payload.siteCode || null,
            merchantReference: payload.merchantReference || null,
            customerMerchantReference: payload.customerMerchantReference || null,
            lastStatus: status,
            lastSubStatus: subStatus,
            lastNotificationAt: new Date(),
          },
          update: {
            siteCode: payload.siteCode || null,
            merchantReference: payload.merchantReference || null,
            customerMerchantReference: payload.customerMerchantReference || null,
            lastStatus: status,
            lastSubStatus: subStatus,
            lastNotificationAt: new Date(),
          },
        });
      }

      return { duplicate };
    });

    return result;
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

  return {
    store: createPrismaNotificationStore(),
    usesDatabase: true,
  };
};

module.exports = {
  createNotificationStoreFromEnv,
};
