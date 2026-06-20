# SecureX — Ozow Payout Webhooks

## API Documentation

For full request/response schemas and hash validation rules, see:

- [docs/ozow-webhooks-api.md](docs/ozow-webhooks-api.md)
- [docs/ozow-webhooks-openapi.yaml](docs/ozow-webhooks-openapi.yaml)

## Setup

```bash
npm install
cp .env.example .env   # fill in OZOW_SITE_CODE, OZOW_API_KEY, OZOW_ACCOUNT_NUMBER_DECRYPTION_KEY
npm run dev
```

`npm run start` now attempts to start PostgreSQL automatically using Docker Compose before booting the API.

## PostgreSQL (optional, recommended for production)

Set these in `.env`:

```dotenv
DATABASE_URL=postgres://postgres:postgres@localhost:5432/securex
DATABASE_SSL=false
```

Initialize tables:

```bash
npm run db:init
```

Manual DB control commands:

```bash
npm run db:up
npm run db:down
```

To disable automatic DB startup for a run:

```bash
AUTO_START_DB=false npm run start
```

When `DATABASE_URL` is set, notification idempotency and payout status history are persisted in PostgreSQL.
When `DATABASE_URL` is not set, the app falls back to in-memory notification deduplication.

## Send Ozow these three values to activate staging

| Field | Value |
|---|---|
| Notification URL | `https://<your-domain>/securex/payout-notification` |
| Verification URL | `https://<your-domain>/securex/payout-verify` |
| Access Token | `YOUR ACCESS TOKEN` |

The Access Token is a static 24-character string used by Ozow when calling your webhooks.

## Ozow handoff checklist

Share these exact values with Ozow:
- Notification URL: where Ozow posts payout response variables.
- Verification URL: where Ozow verifies payout requests before processing.
- Access Token: static 24-character webhook security token.

Before sharing, confirm both URLs are publicly reachable over HTTPS.

For local testing, use [ngrok](https://ngrok.com): `ngrok http 3000`

## Endpoints

**`POST /securex/payout-notification`**
Ozow posts the payout outcome here (Complete, Cancelled, Error).

This implementation now:
- Authenticates using `AccessToken` header (or `Authorization: Bearer ...` fallback).
- Validates required notification fields.
- Recomputes and verifies `hashCheck` using Ozow's notification hash order:
	- `payoutId + siteCode + merchantReference + customerMerchantReference + payoutStatus + payoutSubStatus + apiKey`
- Handles duplicate notifications safely by ignoring duplicate events for the same `payoutId + status + subStatus` combination.
- Returns HTTP 200 for valid/invalid notifications so Ozow receives an acknowledgement.

**`POST /securex/payout-verify`**
Ozow calls this before processing each payout.

This implementation now:
- Authenticates using `AccessToken` header (or `Authorization: Bearer ...` fallback).
- Validates required request fields.
- Recomputes and verifies `hashCheck` using Ozow's SHA-512 algorithm.
- Returns HTTP 200 with:
	- `isVerified: true` and `accountNumberDecryptionKey` when valid.
	- `isVerified: false` plus `reason` when invalid.

### Environment variables used by payout verification webhook

| Variable | Purpose |
|---|---|
| `OZOW_ACCESS_TOKEN` | Access token Ozow sends in `AccessToken` header |
| `OZOW_API_KEY` | Used to recompute `hashCheck` |
| `OZOW_ACCOUNT_NUMBER_DECRYPTION_KEY` | AES key returned to Ozow as `accountNumberDecryptionKey` |

## Local webhook verification test

Run your API first in one terminal:

```bash
npm run dev
```

Then run the test in another terminal:

```bash
npm run test:payout-verify
```

Optional override if your webhook runs elsewhere:

```bash
OZOW_VERIFY_WEBHOOK_URL='http://localhost:3000/securex/payout-verify' npm run test:payout-verify
```

The script sends one valid hash request and one invalid hash request and asserts:
- valid request returns HTTP 200 and `isVerified=true`
- invalid request returns HTTP 200 and `isVerified=false`

### Expected passing output

When everything is configured correctly, `npm run test:payout-verify` should print:

```text
Testing webhook: http://localhost:3000/securex/payout-verify
Valid hash response: 200 { ... isVerified: true, accountNumberDecryptionKey: '...' ... }
Invalid hash response: 200 { ... isVerified: false, reason: 'Invalid hash check' ... }
Webhook verification tests passed.
```

## Local webhook notification test

Run your API first in one terminal:

```bash
npm run dev
```

Then run the notification test in another terminal:

```bash
npm run test:payout-notification
```

Optional override if your notification webhook runs elsewhere:

```bash
OZOW_NOTIFICATION_WEBHOOK_URL='http://localhost:3000/securex/payout-notification' npm run test:payout-notification
```

The script sends:
- one valid notification (expected `processed=true`)
- the same valid notification again (expected `duplicate=true`)
- one invalid hash notification (expected `hashValid=false`)

### Local run notes

- The API loads values from `.env` first and falls back to `.env.example` in local/dev if required Ozow variables are missing.
- If `npm run start` exits immediately, check whether port `3000` is already in use and run on another port, for example:

```bash
PORT=3100 npm run start
OZOW_VERIFY_WEBHOOK_URL='http://localhost:3100/securex/payout-verify' npm run test:payout-verify
```

## Next step: wire up your database
Both handlers have `TODO` comments showing exactly where to add your DB calls.
