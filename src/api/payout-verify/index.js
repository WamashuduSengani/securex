const crypto = require('crypto');

const toCents = (amount) => {
  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount)) return null;
  return Math.round(numericAmount * 100);
};

const buildVerificationHashInput = (payload, ozowApiKey) => {
  const cents = toCents(payload.amount);
  if (cents === null) return null;

  return [
    payload.payoutId || '',
    payload.siteCode || '',
    String(cents),
    payload.merchantReference || '',
    payload.customerBankReference || '',
    String(Boolean(payload.isRtc)),
    payload.notifyUrl || '',
    payload.bankingDetails?.bankGroupId || '',
    payload.bankingDetails?.accountNumber || '',
    payload.bankingDetails?.branchCode || '',
    ozowApiKey,
  ].join('');
};

const sha512Lowercase = (value) => {
  return crypto.createHash('sha512').update(String(value).toLowerCase(), 'utf8').digest('hex');
};

const validateVerificationPayload = (payload) => {
  const required = [
    'payoutId',
    'siteCode',
    'amount',
    'merchantReference',
    'customerBankReference',
    'isRtc',
    'notifyUrl',
    'bankingDetails',
    'hashCheck',
  ];

  for (const field of required) {
    if (payload[field] === undefined || payload[field] === null || payload[field] === '') {
      return `Missing field: ${field}`;
    }
  }

  if (!payload.bankingDetails?.bankGroupId) return 'Missing field: bankingDetails.bankGroupId';
  if (!payload.bankingDetails?.accountNumber) return 'Missing field: bankingDetails.accountNumber';
  if (!payload.bankingDetails?.branchCode) return 'Missing field: bankingDetails.branchCode';
  if (toCents(payload.amount) === null) return 'Invalid field: amount';

  return null;
};

const verificationResponse = (payoutId, isVerified, accountNumberDecryptionKey, reason) => {
  return {
    payoutId,
    isVerified,
    accountNumberDecryptionKey,
    reason,
    PayoutId: payoutId,
    IsVerified: isVerified,
    AccountNumberDecryptionKey: accountNumberDecryptionKey,
    Reason: reason,
  };
};

const verifyPayoutPayload = (payload, config) => {
  const validationError = validateVerificationPayload(payload);

  if (validationError) {
    return {
      statusCode: 200,
      body: verificationResponse(payload.payoutId || '', false, '', validationError.slice(0, 50)),
    };
  }

  const hashInput = buildVerificationHashInput(payload, config.ozowApiKey);
  const calculatedHash = sha512Lowercase(hashInput);
  const providedHash = String(payload.hashCheck || '').toLowerCase();
  const isHashValid = calculatedHash === providedHash;

  if (!isHashValid) {
    return {
      statusCode: 200,
      body: verificationResponse(payload.payoutId, false, '', 'Invalid hash check'),
    };
  }

  return {
    statusCode: 200,
    body: verificationResponse(payload.payoutId, true, config.ozowAccountNumberDecryptionKey, ''),
  };
};

module.exports = {
  verifyPayoutPayload,
};
