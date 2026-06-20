const fs = require('fs');
require('dotenv').config();

if (!process.env.OZOW_ACCESS_TOKEN || !process.env.OZOW_API_KEY) {
  const envExamplePath = '.env.example';
  if (fs.existsSync(envExamplePath)) {
    require('dotenv').config({ path: envExamplePath, override: false });
  }
}
const crypto = require('crypto');

const TARGET_URL = process.env.OZOW_VERIFY_WEBHOOK_URL || 'http://localhost:3000/securex/payout-verify';
const ACCESS_TOKEN = process.env.OZOW_ACCESS_TOKEN || '';
const API_KEY = process.env.OZOW_API_KEY || '';

const toCents = (amount) => Math.round(Number(amount) * 100);

const buildHashInput = (payload) => {
  return [
    payload.payoutId,
    payload.siteCode,
    String(toCents(payload.amount)),
    payload.merchantReference,
    payload.customerBankReference,
    String(Boolean(payload.isRtc)),
    payload.notifyUrl,
    payload.bankingDetails.bankGroupId,
    payload.bankingDetails.accountNumber,
    payload.bankingDetails.branchCode,
    API_KEY,
  ].join('');
};

const sha512Lowercase = (value) => {
  return crypto.createHash('sha512').update(String(value).toLowerCase(), 'utf8').digest('hex');
};

const makeBasePayload = () => {
  return {
    payoutId: '00000000-0000-0000-0000-000000000000',
    siteCode: process.env.OZOW_SITE_CODE || 'TEST_SITE',
    amount: 17.15,
    merchantReference: '123',
    customerBankReference: 'ABC123',
    isRtc: false,
    notifyUrl: 'https://requestcatcher.com/',
    bankingDetails: {
      bankGroupId: '13999FA-3A32-4E3D-82F0-A1DF7E9E4F7B',
      accountNumber: 'ff313a955ad9a8ddff32cb734d49fbcddd8eeb1e235009d59a801bc5af78270cfd',
      branchCode: '198765',
    },
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
  validPayload.hashCheck = sha512Lowercase(buildHashInput(validPayload));

  const invalidPayload = {
    ...validPayload,
    hashCheck: 'bad-hash',
  };

  console.info(`Testing webhook: ${TARGET_URL}`);

  const validResult = await postJson(TARGET_URL, ACCESS_TOKEN, validPayload);
  console.info('Valid hash response:', validResult.status, validResult.body);
  assert(validResult.status === 200, 'Expected 200 for valid hash request');
  assert(validResult.body?.isVerified === true || validResult.body?.IsVerified === true, 'Expected isVerified=true for valid hash');

  const invalidResult = await postJson(TARGET_URL, ACCESS_TOKEN, invalidPayload);
  console.info('Invalid hash response:', invalidResult.status, invalidResult.body);
  assert(invalidResult.status === 200, 'Expected 200 for invalid hash request');
  assert(invalidResult.body?.isVerified === false || invalidResult.body?.IsVerified === false, 'Expected isVerified=false for invalid hash');

  console.info('Webhook verification tests passed.');
};

run().catch((error) => {
  console.error('Webhook verification tests failed:', error.message);
  process.exitCode = 1;
});
