const fs = require('fs');
require('dotenv').config();

if (!process.env.OZOW_ACCESS_TOKEN || !process.env.OZOW_API_KEY) {
  const envExamplePath = '.env.example';
  if (fs.existsSync(envExamplePath)) {
    require('dotenv').config({ path: envExamplePath, override: false });
  }
}

const {
  buildNotificationHashInput,
  sha512Lowercase,
} = require('../src/api/payout-notification');

const TARGET_URL =
  process.env.OZOW_NOTIFICATION_WEBHOOK_URL || 'http://localhost:3000/securex/payout-notification';
const ACCESS_TOKEN = process.env.OZOW_ACCESS_TOKEN || '';
const API_KEY = process.env.OZOW_API_KEY || '';

const makeBasePayload = () => {
  return {
    payoutId: '00000000-0000-0000-0000-000000000000',
    siteCode: process.env.OZOW_SITE_CODE || 'TEST_SITE',
    merchantReference: '123',
    customerMerchantReference: '123',
    payoutStatus: 1,
    payoutSubStatus: 201,
  };
};

const postJson = async (url, token, body) => {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      AccessToken: token,
    },
    body: JSON.stringify(body),
  });

  let parsed;
  try {
    parsed = await response.json();
  } catch (_error) {
    parsed = null;
  }

  return {
    status: response.status,
    body: parsed,
  };
};

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const run = async () => {
  if (!ACCESS_TOKEN || !API_KEY) {
    throw new Error(
      'Missing OZOW_ACCESS_TOKEN or OZOW_API_KEY. Add them to .env (recommended) or .env.example.'
    );
  }

  const validPayload = makeBasePayload();
  validPayload.hashCheck = sha512Lowercase(buildNotificationHashInput(validPayload, API_KEY));

  const invalidPayload = {
    ...validPayload,
    hashCheck: 'bad-hash',
  };

  console.info(`Testing webhook: ${TARGET_URL}`);

  const validResult = await postJson(TARGET_URL, ACCESS_TOKEN, validPayload);
  console.info('Valid notification response:', validResult.status, validResult.body);
  assert(validResult.status === 200, 'Expected 200 for valid notification request');
  assert(validResult.body?.hashValid === true, 'Expected hashValid=true for valid notification');
  assert(validResult.body?.processed === true, 'Expected processed=true for first valid notification');

  const duplicateResult = await postJson(TARGET_URL, ACCESS_TOKEN, validPayload);
  console.info('Duplicate notification response:', duplicateResult.status, duplicateResult.body);
  assert(duplicateResult.status === 200, 'Expected 200 for duplicate notification request');
  assert(duplicateResult.body?.hashValid === true, 'Expected hashValid=true for duplicate notification');
  assert(duplicateResult.body?.duplicate === true, 'Expected duplicate=true for duplicate notification');

  const invalidResult = await postJson(TARGET_URL, ACCESS_TOKEN, invalidPayload);
  console.info('Invalid notification response:', invalidResult.status, invalidResult.body);
  assert(invalidResult.status === 200, 'Expected 200 for invalid notification request');
  assert(invalidResult.body?.hashValid === false, 'Expected hashValid=false for invalid notification');

  console.info('Notification webhook tests passed.');
};

run().catch((error) => {
  console.error('Notification webhook tests failed:', error.message);
  process.exitCode = 1;
});
