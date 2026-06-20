# Ozow Webhooks API Documentation

This document describes the two merchant-facing webhook endpoints required by Ozow payout integrations.

OpenAPI 3.0 spec:

- [docs/ozow-webhooks-openapi.yaml](docs/ozow-webhooks-openapi.yaml)

## Base URL

Use your public HTTPS domain:

- `https://<your-domain>/securex/payout-verify`
- `https://<your-domain>/securex/payout-notification`

## Authentication (Both Endpoints)

Ozow sends your access token in the `AccessToken` header.

Supported by this API:

- `AccessToken: <token>`
- `Authorization: Bearer <token>`

If token validation fails, endpoint returns:

- HTTP `401`
- Body: `{ "error": "Unauthorized webhook call" }`

## Environment Variables

- `OZOW_ACCESS_TOKEN`: shared webhook token (required by both endpoints)
- `OZOW_API_KEY`: used for SHA-512 hash validation (required by both endpoints)
- `OZOW_ACCOUNT_NUMBER_DECRYPTION_KEY`: returned on successful verify response (required by verify endpoint)

---

## 1) Verify Payout Webhook

### Endpoint

- Method: `POST`
- Path: `/securex/payout-verify`

### Purpose

- Verify each payout request.
- Return the AES key (`accountNumberDecryptionKey`) Ozow uses to decrypt destination account number.

### Request Body

```json
{
  "payoutId": "00000000-0000-0000-0000-000000000000",
  "siteCode": "YOUR_SITE_CODE",
  "amount": 17.15,
  "merchantReference": "123",
  "customerBankReference": "ABC123",
  "isRtc": false,
  "notifyUrl": "https://requestcatcher.com/",
  "bankingDetails": {
    "bankGroupId": "13999FA-3A32-4E3D-82F0-A1DF7E9E4F7B",
    "accountNumber": "ff313a955ad9a8ddff32cb734d49fbcddd8eeb1e235009d59a801bc5af78270cfd",
    "branchCode": "198765"
  },
  "hashCheck": "<sha512-hash>"
}
```

### Hash Validation Rule

Build input in this order (excluding `hashCheck`):

1. `payoutId`
2. `siteCode`
3. `amount * 100` (integer cents)
4. `merchantReference`
5. `customerBankReference`
6. `isRtc` (as `true` or `false` string)
7. `notifyUrl`
8. `bankingDetails.bankGroupId`
9. `bankingDetails.accountNumber`
10. `bankingDetails.branchCode`
11. `OZOW_API_KEY`

Then:

1. Concatenate all values.
2. Convert to lowercase.
3. Compute SHA-512 hex digest.
4. Compare with `hashCheck` (case-insensitive).

### Success Response

- HTTP `200`

```json
{
  "payoutId": "00000000-0000-0000-0000-000000000000",
  "isVerified": true,
  "accountNumberDecryptionKey": "YOUR_AES_KEY",
  "reason": "",
  "PayoutId": "00000000-0000-0000-0000-000000000000",
  "IsVerified": true,
  "AccountNumberDecryptionKey": "YOUR_AES_KEY",
  "Reason": ""
}
```

### Invalid Hash / Validation Response

- HTTP `200`

```json
{
  "payoutId": "00000000-0000-0000-0000-000000000000",
  "isVerified": false,
  "accountNumberDecryptionKey": "",
  "reason": "Invalid hash check"
}
```

### Server Misconfiguration Response

- HTTP `500` when required env vars are missing (`OZOW_API_KEY` or `OZOW_ACCOUNT_NUMBER_DECRYPTION_KEY`).

### Response Status Summary

- `200`: request was handled (verified or rejected with reason).
- `401`: access token missing or invalid.
- `500`: server missing required verify config (`OZOW_API_KEY` or `OZOW_ACCOUNT_NUMBER_DECRYPTION_KEY`).

---

## 2) Payout Notification Webhook

### Endpoint

- Method: `POST`
- Path: `/securex/payout-notification`

### Purpose

- Receive final payout status updates from Ozow.
- Verify notification integrity via hash.
- Handle duplicate notifications safely.

### Request Body

Payload supports either status format:

- Flat format:

```json
{
  "payoutId": "00000000-0000-0000-0000-000000000000",
  "siteCode": "YOUR_SITE_CODE",
  "merchantReference": "123",
  "customerMerchantReference": "123",
  "payoutStatus": 1,
  "payoutSubStatus": 201,
  "hashCheck": "<sha512-hash>"
}
```

- Nested format:

```json
{
  "payoutId": "00000000-0000-0000-0000-000000000000",
  "siteCode": "YOUR_SITE_CODE",
  "merchantReference": "123",
  "customerMerchantReference": "123",
  "payoutStatus": {
    "status": 1,
    "subStatus": 201
  },
  "hashCheck": "<sha512-hash>"
}
```

### Hash Validation Rule

Build input in this order (excluding `hashCheck`):

1. `payoutId`
2. `siteCode`
3. `merchantReference`
4. `customerMerchantReference`
5. `payoutStatus`
6. `payoutSubStatus`
7. `OZOW_API_KEY`

Then:

1. Concatenate all values.
2. Convert to lowercase.
3. Compute SHA-512 hex digest.
4. Compare with `hashCheck` (case-insensitive).

### Success Response (First Time Notification)

- HTTP `200`

```json
{
  "received": true,
  "processed": true,
  "duplicate": false,
  "hashValid": true,
  "payoutId": "00000000-0000-0000-0000-000000000000"
}
```

### Duplicate Response

- HTTP `200`

```json
{
  "received": true,
  "processed": false,
  "duplicate": true,
  "hashValid": true,
  "payoutId": "00000000-0000-0000-0000-000000000000"
}
```

### Invalid Hash / Validation Response

- HTTP `200`

```json
{
  "received": true,
  "processed": false,
  "duplicate": false,
  "hashValid": false,
  "reason": "Invalid hash check"
}
```

### Unauthorized Response

- HTTP `401`

```json
{
  "error": "Unauthorized webhook call"
}
```

### Misconfiguration Response

- HTTP `500`

```json
{
  "error": "Server misconfigured: missing OZOW_API_KEY"
}
```

Note: duplicate protection is currently in-memory and resets when the service restarts.

### Response Status Summary

- `200`: notification was acknowledged (processed, duplicate, or rejected with reason).
- `401`: access token missing or invalid.
- `500`: server missing required notification config (`OZOW_API_KEY`).

---

## Quick cURL Examples

### Verify Webhook

```bash
curl -X POST 'https://<your-domain>/securex/payout-verify' \
  -H 'Content-Type: application/json' \
  -H 'AccessToken: <your-access-token>' \
  -d '{
    "payoutId":"00000000-0000-0000-0000-000000000000",
    "siteCode":"YOUR_SITE_CODE",
    "amount":17.15,
    "merchantReference":"123",
    "customerBankReference":"ABC123",
    "isRtc":false,
    "notifyUrl":"https://requestcatcher.com/",
    "bankingDetails":{
      "bankGroupId":"13999FA-3A32-4E3D-82F0-A1DF7E9E4F7B",
      "accountNumber":"ff313a955ad9a8ddff32cb734d49fbcddd8eeb1e235009d59a801bc5af78270cfd",
      "branchCode":"198765"
    },
    "hashCheck":"<sha512-hash>"
  }'
```

### Notification Webhook

```bash
curl -X POST 'https://<your-domain>/securex/payout-notification' \
  -H 'Content-Type: application/json' \
  -H 'AccessToken: <your-access-token>' \
  -d '{
    "payoutId":"00000000-0000-0000-0000-000000000000",
    "siteCode":"YOUR_SITE_CODE",
    "merchantReference":"123",
    "customerMerchantReference":"123",
    "payoutStatus":1,
    "payoutSubStatus":201,
    "hashCheck":"<sha512-hash>"
  }'
```
