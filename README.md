# open.INC Push Microservice

Low-throughput Node.js push notification service with REST ingress and provider delivery for Web Push, FCM, APNs, and Email (SMTP).

## Features

- REST API for endpoint registration, notification submit, and status lookup
- M2M API-key authentication (no user-account management)
- MongoDB-backed internal dispatch queue (`DispatchJob` collection)
- In-process worker with retries/backoff/dead state
- Provider adapters for Web Push, FCM, APNs, Email (SMTP)
- Health and Prometheus metrics endpoints
- OpenAPI docs at `/docs`

## Requirements

- Node.js 22+
- MongoDB

## Setup

### 1) Clone and install

1. Copy env template:
   - `cp .env.example .env`
2. Install dependencies:
   - `npm install`

### 2) Configure environment variables

Populate `.env` using the guide below.

All variables are namespaced and must start with `OPENINC_PUSH_`.

#### Core runtime

- `OPENINC_PUSH_NODE_ENV`
  - Use `development` locally, `production` in deployment.
- `OPENINC_PUSH_PORT`
  - Any free port (default `3000`).
- `OPENINC_PUSH_LOG_LEVEL`
  - Typical values: `info`, `debug`, `warn`, `error`.

#### MongoDB

- `OPENINC_PUSH_MONGODB_URI`
  - From your MongoDB instance.
  - Local Docker example: `mongodb://localhost:27017`
  - MongoDB Atlas: get from Atlas UI → Connect → Drivers.
- `OPENINC_PUSH_MONGODB_DB_NAME`
  - Database name to use (e.g. `openinc_push`).
- `OPENINC_PUSH_MONGODB_COLLECTION_PREFIX`
  - Prefix for all collections created by this service (e.g. `openinc_push_`).

#### Security

- `OPENINC_PUSH_API_KEY_SALT`
  - Random secret string used for API key hashing.
  - Generate with:
    - `openssl rand -hex 32`
- `OPENINC_PUSH_ENCRYPTION_KEY_BASE64`
  - Must be a Base64 value of exactly 32 raw bytes.
  - Generate with:
    - `openssl rand -base64 32`

#### Worker behavior (low-throughput defaults)

- `OPENINC_PUSH_DEFAULT_MAX_ATTEMPTS`
  - Max retry attempts for retryable delivery failures.
- `OPENINC_PUSH_WORKER_POLL_INTERVAL_MS`
  - Polling interval for DB-backed dispatch queue.
- `OPENINC_PUSH_WORKER_BATCH_SIZE`
  - Number of jobs leased per cycle.
- `OPENINC_PUSH_WORKER_LEASE_MS`
  - Lease timeout for in-progress jobs.

#### Web Push (browser push)

- `OPENINC_PUSH_WEB_PUSH_VAPID_SUBJECT`
  - Contact URI, usually email, for VAPID metadata.
  - Example: `mailto:ops@example.com`
- `OPENINC_PUSH_WEB_PUSH_VAPID_PUBLIC_KEY`
- `OPENINC_PUSH_WEB_PUSH_VAPID_PRIVATE_KEY`
  - Generate VAPID key pair using one of:
    - `npx web-push generate-vapid-keys`
    - or use existing keys from your push infrastructure.

#### FCM (Android native)

- `OPENINC_PUSH_FCM_SERVICE_ACCOUNT_JSON`
  - Full JSON of Firebase service account credentials (single-line JSON string).
  - Source:
    1. Firebase Console → Project Settings → Service accounts
    2. Generate new private key
    3. Copy JSON content into env var (escaped/single-line as needed by your deployment system)

#### APNs (Apple Push)

- `OPENINC_PUSH_APNS_KEY_PATH`
  - Filesystem path to your `.p8` APNs auth key.
- `OPENINC_PUSH_APNS_KEY_ID`
  - Key ID shown in Apple Developer portal.
- `OPENINC_PUSH_APNS_TEAM_ID`
  - Apple Developer Team ID.
- `OPENINC_PUSH_APNS_TOPIC`
  - App bundle identifier (e.g. `com.example.app`).
- `OPENINC_PUSH_APNS_PRODUCTION`
  - `false` for sandbox/testing, `true` for production APNs endpoint.

APNs credential source:

1. Apple Developer Account → Certificates, Identifiers & Profiles
2. Keys → create APNs Auth Key
3. Download `.p8`, record Key ID and Team ID
4. Use app bundle ID as `APNS_TOPIC`

#### Email (SMTP)

- `OPENINC_PUSH_SMTP_HOST`
  - SMTP server host (for example from your mail provider or internal relay).
- `OPENINC_PUSH_SMTP_PORT`
  - SMTP server port (`587` for STARTTLS, `465` for implicit TLS).
- `OPENINC_PUSH_SMTP_SECURE`
  - `true` for implicit TLS (typically port `465`), otherwise `false`.
- `OPENINC_PUSH_SMTP_USER`
- `OPENINC_PUSH_SMTP_PASS`
  - Credentials for SMTP auth (if your server requires auth).
- `OPENINC_PUSH_SMTP_FROM`
  - Default sender address for outbound emails.

Typical sources:

- Internal SMTP relay details from platform/infrastructure team.
- Provider dashboard (e.g. SES, Mailgun, SendGrid SMTP credentials).

### 3) Optional bootstrap of first machine client

Set these environment variables before starting the service if you want automatic initial API client creation:

- `OPENINC_PUSH_BOOTSTRAP_CLIENT_APP_NAME`
- `OPENINC_PUSH_BOOTSTRAP_CLIENT_APP_API_KEY`

The API key value is hashed and stored; plaintext is not persisted.

### 4) Start service

- API + in-process worker:
  - `npm run dev`
- Worker-only mode:
  - `npm run worker`

## Quick Start

1. `cp .env.example .env`
2. Fill `.env` using the “Configure environment variables” section above
3. `npm install`
4. `npm run dev`

Worker loop starts inside the API process (`src/server.ts`). You can also run worker-only mode:

- `npm run worker`

## API Overview

### Authentication

All protected endpoints require:

- Header: `x-api-key: <your-client-api-key>`

Public endpoints (no API key required):

- `GET /health/live`
- `GET /health/ready`
- `GET /metrics`
- `GET /docs`

### 1) Register endpoint

- Method/Path: `POST /v1/endpoints`
- Purpose: register a target endpoint for one channel (`webpush`, `fcm`, `apns`, `email`)

Request body:

```json
{
  "channel": "email",
  "externalRef": "device-01",
  "tokenOrSubscription": "ops@example.com",
  "platformMetadata": {
    "source": "m2m"
  }
}
```

Response (`201`):

```json
{
  "id": "67d5d5f7f72e7dc3c7f56ab1",
  "status": "active"
}
```

### 2) Update endpoint

- Method/Path: `PATCH /v1/endpoints/:id`
- Purpose: update token/subscription, metadata, or endpoint status

Request body example:

```json
{
  "status": "active",
  "platformMetadata": {
    "appVersion": "1.2.3"
  }
}
```

Response (`200`):

```json
{
  "id": "67d5d5f7f72e7dc3c7f56ab1",
  "status": "active"
}
```

### 3) Deactivate endpoint

- Method/Path: `DELETE /v1/endpoints/:id`
- Purpose: mark endpoint as unsubscribed

Response:

- `204 No Content` on success
- `404` if endpoint is not found for the authenticated client

### 4) Submit notification

- Method/Path: `POST /v1/notifications/send`
- Purpose: submit a notification request for async dispatch
- Optional header: `Idempotency-Key: <unique-key>`

Request body example:

```json
{
  "endpointIds": ["67d5d5f7f72e7dc3c7f56ab1"],
  "payload": {
    "title": "Service Alert",
    "body": "Queue length exceeded threshold",
    "data": {
      "severity": "high"
    },
    "priority": "high",
    "email": {
      "subject": "[ALERT] Queue threshold exceeded",
      "html": "<strong>Queue length exceeded threshold</strong>"
    }
  }
}
```

Response (`202`):

```json
{
  "notificationId": "67d5d6cdf72e7dc3c7f56ab2",
  "status": "accepted"
}
```

### 5) Get notification status

- Method/Path: `GET /v1/notifications/:id`
- Purpose: fetch current request state and all delivery attempts

Response (`200`) example:

```json
{
  "notification": {
    "id": "67d5d6cdf72e7dc3c7f56ab2",
    "clientAppId": "67d5d59cf72e7dc3c7f56ab0",
    "status": "sent"
  },
  "attempts": [
    {
      "provider": "email",
      "attemptNumber": 1,
      "outcome": "success"
    }
  ]
}
```

### Health, metrics, and docs

- `GET /health/live`: process liveness
- `GET /health/ready`: readiness (DB + config readiness)
- `GET /metrics`: Prometheus metrics output
- `GET /docs`: Swagger UI

### Common error responses

- `400`: validation error for request body
- `401`: missing/invalid API key
- `404`: resource not found in caller scope

## Provider Example Flows

Each flow follows the same pattern:

1. Register endpoint (`POST /v1/endpoints`)
2. Submit notification (`POST /v1/notifications/send`)
3. Poll status (`GET /v1/notifications/:id`)

Use headers on protected calls:

- `x-api-key: <your-client-api-key>`
- Optional on send: `Idempotency-Key: <unique-key>`

### Web Push flow (browser)

Register endpoint (browser PushSubscription JSON serialized as string):

```json
{
  "channel": "webpush",
  "externalRef": "browser-device-1",
  "tokenOrSubscription": "{\"endpoint\":\"https://fcm.googleapis.com/fcm/send/abc\",\"keys\":{\"p256dh\":\"...\",\"auth\":\"...\"}}",
  "platformMetadata": {
    "browser": "chrome"
  }
}
```

Send notification:

```json
{
  "endpointIds": ["<webpush-endpoint-id>"],
  "payload": {
    "title": "Web Alert",
    "body": "Browser notification test",
    "webpush": {
      "urgency": "high",
      "ttl": 120
    }
  }
}
```

### FCM flow (Android)

Register endpoint (FCM registration token):

```json
{
  "channel": "fcm",
  "externalRef": "android-device-1",
  "tokenOrSubscription": "fcm-registration-token",
  "platformMetadata": {
    "platform": "android"
  }
}
```

Send notification:

```json
{
  "endpointIds": ["<fcm-endpoint-id>"],
  "payload": {
    "title": "Android Alert",
    "body": "FCM delivery test",
    "data": {
      "type": "alarm"
    },
    "fcm": {
      "androidChannelId": "alerts"
    }
  }
}
```

### APNs flow (iOS)

Register endpoint (APNs device token):

```json
{
  "channel": "apns",
  "externalRef": "ios-device-1",
  "tokenOrSubscription": "apns-device-token",
  "platformMetadata": {
    "platform": "ios"
  }
}
```

Send notification:

```json
{
  "endpointIds": ["<apns-endpoint-id>"],
  "payload": {
    "title": "iOS Alert",
    "body": "APNs delivery test",
    "apns": {
      "apnsPriority": 10,
      "apnsCollapseId": "incident-42"
    }
  }
}
```

### Email flow (SMTP)

Register endpoint (recipient email):

```json
{
  "channel": "email",
  "externalRef": "ops-mailbox",
  "tokenOrSubscription": "ops@example.com"
}
```

Send notification:

```json
{
  "endpointIds": ["<email-endpoint-id>"],
  "payload": {
    "title": "Service Alert",
    "body": "Queue length exceeded threshold",
    "email": {
      "subject": "[ALERT] Queue threshold exceeded",
      "html": "<strong>Queue length exceeded threshold</strong>",
      "replyTo": "noreply@example.com"
    }
  }
}
```

### Shared status check

After each send request, use the returned `notificationId`:

- `GET /v1/notifications/<notificationId>`

Expected status progression:

- `accepted` → `processing` → `sent` / `partially_sent` / `failed`

### Built-in browser test page

For quick manual testing in a browser, open:

- `GET /webpush/test`

What it does:

1. Loads VAPID public key from `GET /webpush/public-key`
2. Registers a service worker from `GET /webpush/sw.js`
3. Subscribes browser Push API and registers endpoint via `POST /v1/endpoints`
4. Sends a test message via `POST /v1/notifications/send`
5. Checks delivery status via `GET /v1/notifications/:id`

You still need a valid API key in the test page to call protected endpoints.

## Adapter Contract (Contributors)

All provider adapters implement a shared send contract:

```ts
send(input: {
  target: string;
  topic: string;
  payload: string;
  options: Record<string, unknown>;
}): Promise<ProviderSendResult>
```

### Field meaning

- `target`
  - Provider destination identifier.
  - Examples: Web Push subscription JSON string, FCM token, APNs device token, Email address.
- `topic`
  - Message subject/title.
- `payload`
  - Main message body/content.
- `options`
  - Provider-specific extension object (non-standard fields).

### Current provider mapping

- `webpush`
  - `target`: serialized PushSubscription
  - `topic`: notification title
  - `payload`: notification body
  - `options`: `ttl`, `urgency`, optional `topic`, plus `data`
- `fcm`
  - `target`: FCM registration token
  - `topic`: notification title
  - `payload`: notification body
  - `options`: channel-specific fields merged with common `data`
- `apns`
  - `target`: APNs device token
  - `topic`: alert title
  - `payload`: alert body
  - `options`: `apnsPriority`, `apnsCollapseId`, plus `data`
- `email`
  - `target`: recipient email address
  - `topic`: mail subject
  - `payload`: plain text body
  - `options`: `html`, `replyTo`, optional `from`

### Worker normalization

The worker normalizes API payloads into this contract before calling adapters:

- Common values (`title`, `body`, `data`, `ttl`, `priority`, `collapseKey`)
- Channel-specific object (`webpush`, `fcm`, `apns`, `email`)
- Merged into `ProviderSendInput.options`

This keeps adapters consistent and allows adding new providers with minimal changes.

## Notes

- Endpoint token/subscription values are encrypted at rest.
- API keys are stored as hashes.
- For `email` endpoints, `tokenOrSubscription` must be an email address.
