# Needl Backend

Backend API for Needl (`needl-driver-api`).

## What Lives Here

- MongoDB driver-powered read/write operations
- Firebase ID token verification
- Collection/database routes for the app explorer
- Optional Stripe donation session + webhook endpoints

## Requirements

- Node.js 18+
- npm

## Environment Setup

Copy/create `.env` in this folder and provide:

```env
PORT=3001
FIREBASE_PROJECT_ID=...
FIREBASE_CLIENT_EMAIL=...
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

Optional Stripe:

```env
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_DONATE_CURRENCY=cad
STRIPE_DONATE_PRODUCT_NAME=Support Needl
# DONATE_REDIRECT_ALLOWLIST=https://yourapp.com,needl://
```

## Install & Run

```bash
npm install
npm run dev
```

Build/start:

```bash
npm run build
npm run start
```

## Core Routes (high level)

- `POST /v1/mongo/list-databases`
- `POST /v1/mongo/list-collections`
- `POST /v1/mongo/find`
- `POST /v1/mongo/insert-one`
- `POST /v1/mongo/replace-one`
- `POST /v1/mongo/delete-one`

Stripe:

- `GET /v1/stripe/donate-status`
- `POST /v1/stripe/create-donation-session`
- `POST /v1/stripe/webhook`

## Auth Model

- Most `/v1/*` routes require `Authorization: Bearer <Firebase ID token>`
- Token is verified with Firebase Admin SDK

## Stripe Webhook (Local Test)

```bash
stripe listen --forward-to http://localhost:3001/v1/stripe/webhook
```

Copy the provided `whsec_...` into `STRIPE_WEBHOOK_SECRET`.

## Troubleshooting

- 401 errors:
  - Verify Firebase admin env values
  - Verify frontend is sending a valid ID token
- Mongo errors:
  - Confirm URI validity and DB/collection names
- Stripe disabled in app:
  - Ensure `STRIPE_SECRET_KEY` is set and backend restarted

