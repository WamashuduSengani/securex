const crypto = require('crypto');

const toInteger = (value) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
};

const readStatus = (payload) => {
  if (payload.payoutStatus && typeof payload.payoutStatus === 'object') {
    return {
      status: toInteger(payload.payoutStatus.status),
      subStatus: toInteger(payload.payoutStatus.subStatus),
    };
  }

  return {
    status: toInteger(payload.payoutStatus),
    subStatus: toInteger(payload.payoutSubStatus ?? payload.subStatus),
  };
};

const buildNotificationHashInput = (payload, ozowApiKey) => {
  const { status, subStatus } = readStatus(payload);

  return [
    payload.payoutId || '',
    payload.siteCode || '',
    payload.merchantReference || '',
    payload.customerMerchantReference || '',
    status === null ? '' : String(status),
    subStatus === null ? '' : String(subStatus),
    ozowApiKey,
  ].join('');
};

const sha512Lowercase = (value) => {
  return crypto.createHash('sha512').update(String(value).toLowerCase(), 'utf8').digest('hex');
};

const validateNotificationPayload = (payload) => {
  const required = [
    'payoutId',
    'siteCode',
    'merchantReference',
    'customerMerchantReference',
    'hashCheck',
  ];

  for (const field of required) {
    if (payload[field] === undefined || payload[field] === null || payload[field] === '') {
      return `Missing field: ${field}`;
    }
  }

  const { status, subStatus } = readStatus(payload);

  if (status === null) return 'Missing or invalid field: payoutStatus';
  if (subStatus === null) return 'Missing or invalid field: payoutSubStatus';

  return null;
};

const createNotificationProcessor = (options = {}) => {
  const store = options.store;

  const processPayoutNotification = async (payload, config) => {
    const { status, subStatus } = readStatus(payload);
    const payoutId = payload.payoutId || 'unknown';
    const eventKey = `${payoutId}:${status}:${subStatus}`;

    const validationError = validateNotificationPayload(payload);
    if (validationError) {
      if (store) {
        await store.handleNotification({
          eventKey,
          payload,
          status,
          subStatus,
          hashValid: false,
          reason: validationError,
        });
      }

      return {
        statusCode: 200,
        body: {
          received: true,
          processed: false,
          duplicate: false,
          hashValid: false,
          reason: validationError,
        },
      };
    }

    const hashInput = buildNotificationHashInput(payload, config.ozowApiKey);
    const calculatedHash = sha512Lowercase(hashInput);
    const providedHash = String(payload.hashCheck || '').toLowerCase();

    if (calculatedHash !== providedHash) {
      if (store) {
        await store.handleNotification({
          eventKey,
          payload,
          status,
          subStatus,
          hashValid: false,
          reason: 'Invalid hash check',
        });
      }

      return {
        statusCode: 200,
        body: {
          received: true,
          processed: false,
          duplicate: false,
          hashValid: false,
          reason: 'Invalid hash check',
        },
      };
    }

    const duplicateResult = store
      ? await store.handleNotification({
        eventKey,
        payload,
        status,
        subStatus,
        hashValid: true,
        reason: '',
      })
      : { duplicate: false };

    if (duplicateResult.duplicate) {
      return {
        statusCode: 200,
        body: {
          received: true,
          processed: false,
          duplicate: true,
          hashValid: true,
          payoutId: payload.payoutId,
        },
      };
    }

    return {
      statusCode: 200,
      body: {
        received: true,
        processed: true,
        duplicate: false,
        hashValid: true,
        payoutId: payload.payoutId,
      },
    };
  };

  return {
    processPayoutNotification,
  };
};

module.exports = {
  buildNotificationHashInput,
  createNotificationProcessor,
  sha512Lowercase,
};
