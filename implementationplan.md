# Agent Implementation Plan — Node.js Push Notification Service

## 1) Purpose of This Document

This file is an **execution guide for coding agents**. It defines the implementation order, hard constraints, and acceptance checks for a Node.js service that sends push notifications.

Agents must follow this plan as source-of-truth for scope and architecture.

---

## 2) Mission and Hard Constraints

### Mission

Implement a Node.js service with a REST API to send push notifications through:

- Web Push (mobile + desktop browsers)
- FCM (Android native)
- APNs (Apple devices)

REST is first ingress. Architecture must support adding MQTT and GraphQL ingress later.

### Hard constraints

1. **Low throughput system**: optimize for simplicity/reliability over high-scale complexity.
2. **No runtime dependency on queue SaaS/extra infra** such as BullMQ/Redis.
3. **M2M-only context**: service does not manage end-user accounts/identity.
4. **Service responsibility**: only manage push-relevant entities (apps/clients, endpoints, notifications, attempts).
5. **Provider adapters only** for external push platforms (Web Push/FCM/APNs).

---

## 3) Non-Goals

Do not implement in initial scope:

- User profile/account management
- Campaign builder UI
- Complex segmentation engine
- Multi-channel messaging outside push
- Hard dependency on Kafka/Redis/BullMQ/RabbitMQ

---

## 4) Architecture Blueprint (Agent Target)

### Layers

1. **Ingress Layer**
   - REST API (initial)
   - Later: MQTT adapter, GraphQL adapter

2. **Application Layer**
   - Notification orchestration (`NotificationService`)
   - Validation, authorization, idempotency
   - Endpoint selection and provider routing

3. **Provider Layer**
   - `WebPushProvider`
   - `FcmProvider`
   - `ApnsProvider`

4. **Persistence Layer**
   - MongoDB (source of truth)
   - All collections should have a shared prefix based on env var

5. **Worker Layer (in-process)**
   - Polls DB job table
   - Sends notifications via providers
   - Retries with backoff
   - Marks terminal failures and dead-letter state in DB

### Key design decision

For low throughput, use a **database-backed job queue pattern** (single dependency: MongoDB). No Redis/BullMQ.

---

## 5) Recommended Stack

- Runtime: Node.js LTS
- Language: TypeScript (strict)
- API framework: Fastify
- DB: MongoDB
- ORM: Use Mongo Schema directly
- Validation: Zod
- Logging: Pino
- Testing: Vitest + Supertest
- Metrics: Prometheus-compatible endpoint

---

## 6) Data Model (M2M-Oriented)

### Entities

1. **ClientApp**
   - Represents a machine client/application using the service
   - Fields: `id`, `name`, `apiKeyHash`, `status`, `createdAt`, `updatedAt`

2. **PushEndpoint**
   - Represents a target device/browser endpoint
   - Fields:
     - `id`, `clientAppId`
     - `channel` (`webpush|fcm|apns`)
     - `externalRef` (optional machine-side reference)
     - `tokenOrSubscriptionEncrypted`
     - `platformMetadata` (json)
     - `status` (`active|invalid|unsubscribed`)
     - timestamps

3. **NotificationRequest**
   - Logical send request received via API
   - Fields:
     - `id`, `clientAppId`
     - `idempotencyKey` (optional)
     - `payloadNormalized` (json)
     - `targeting` (json)
     - `status` (`accepted|processing|sent|partially_sent|failed|expired`)
     - timestamps

4. **DeliveryAttempt**
   - One provider attempt per endpoint
   - Fields:
     - `id`, `notificationRequestId`, `pushEndpointId`
     - `provider`, `attemptNumber`
     - `outcome` (`success|retryable_failure|permanent_failure`)
     - `errorCode`, `errorMessage`, `providerResponse`
     - `nextRetryAt` (nullable)
     - timestamps

5. **DispatchJob**
   - DB-backed async job record
   - Fields:
     - `id`, `notificationRequestId`
     - `status` (`pending|leased|done|dead`)
     - `availableAt`, `leaseUntil`, `attemptCount`, `lastError`
     - timestamps

No `User` entity must be introduced in MVP.

---

## 7) API Contract (REST MVP)

### Authentication

- API key-based M2M auth only.
- Every request resolved to one `ClientApp`.

### Endpoints

1. `POST /v1/endpoints`
   - Register push endpoint (webpush/fcm/apns)
2. `PATCH /v1/endpoints/:id`
   - Update endpoint token/subscription/metadata/status
3. `DELETE /v1/endpoints/:id`
   - Deactivate endpoint
4. `POST /v1/notifications/send`
   - Submit notification request
5. `GET /v1/notifications/:id`
   - Return request status + attempt summary

### Payload model

- Common fields: `title`, `body`, `data`, `ttl`, `priority`, `collapseKey`
- Channel-specific overrides:
  - `webpush`
  - `fcm`
  - `apns`

### Required API behavior

- Strict schema validation
- Idempotency-Key support on send endpoint
- Consistent error model
- OpenAPI generation

---

## 8) Provider Adapter Contract

Define common interface:

- `send(message, endpoint): Promise<ProviderSendResult>`
- `validateEndpoint(endpoint): ProviderEndpointValidationResult`
- `classifyError(error): 'retryable' | 'permanent'`

### Web Push requirements

- VAPID key config validation at startup
- Browser subscription object support

### FCM requirements

- Service account credential loading and startup validation
- Token invalidation handling

### APNs requirements

- p8 auth (key id, team id, topic)
- sandbox/prod switch via configuration

---

## 9) Async Processing Without Third-Party Queue

### Strategy

Use MongoCollection (`DispatchJob`) as internal queue.

### Worker algorithm

1. Poll `DispatchJob` where `status = pending` and `availableAt <= now`.
2. Lease one/few jobs atomically (`status = leased`, set `leaseUntil`).
3. Process notification by fetching target endpoints.
4. Create `DeliveryAttempt` rows and send via providers.
5. On success: mark job `done`.
6. On retryable failure: increment `attemptCount`, set next `availableAt` using backoff, set status `pending`.
7. On permanent/limit failure: set job `dead`, finalize request status.

### Concurrency model

- Single worker process by default.
- Optional multiple workers with DB row-level locking.
- Keep concurrency low and configurable.

---

## 10) Reliability Rules

- Idempotency key applies to `POST /v1/notifications/send`.
- Retry policy:
  - max attempts configurable
  - exponential backoff with cap
- Dead-letter represented by `DispatchJob.status = dead` (no external DLQ infra).
- Endpoint invalidation:
  - mark endpoint invalid when provider returns terminal token/subscription errors.

---

## 11) Security Rules

- Encrypt token/subscription payload at rest.
- Never log raw tokens/subscriptions.
- Hash API keys; never store plaintext.
- Validate all env config at startup; fail fast if critical credentials missing.
- Enforce request size limits.

---

## 12) Observability Requirements

### Logging

- Structured logs with request ID and notification ID.
- Log lifecycle events: accepted, queued, leased, attempt, retry, terminal state.

### Metrics (minimum)

- `notifications_accepted_total`
- `notifications_sent_total`
- `notifications_failed_total`
- `delivery_attempts_total{provider,outcome}`
- `dispatch_jobs_pending`
- `dispatch_jobs_dead_total`
- `dispatch_processing_duration_ms`

### Health endpoints

- `/health/live`
- `/health/ready` (checks DB connection + provider config loaded)

---

## 13) Extensibility Contract for Future Ingress

### Rule

All ingress types must call the same application service API; providers remain unchanged.

### Future adapters

- MQTT adapter maps topic command -> `NotificationService.send()`.
- GraphQL adapter maps mutation -> `NotificationService.send()`.

No ingress adapter may call provider classes directly.

---

## 14) Agent Execution Order (No Time Frames)

### Step 1 — Bootstrap

- Initialize Node.js + TypeScript project.
- Add linting, formatting, tests.
- Create module layout:
  - `src/api`
  - `src/application`
  - `src/providers`
  - `src/persistence`
  - `src/worker`
  - `src/observability`

### Step 2 — Persistence and schema

- Implement DB schema for `ClientApp`, `PushEndpoint`, `NotificationRequest`, `DeliveryAttempt`, `DispatchJob`.
- Add migrations and repository layer.

### Step 3 — Core application services

- Implement endpoint registration/update/deactivation services.
- Implement notification submission service.
- Implement idempotency handling.

### Step 4 — REST ingress

- Implement API key auth middleware.
- Implement endpoint routes and send/status routes.
- Add OpenAPI spec exposure.

### Step 5 — Providers

- Implement Web Push, FCM, APNs adapters with a shared contract.
- Implement provider error classification.

### Step 6 — Worker

- Implement DB polling + lease mechanism.
- Implement retry/backoff and dead state transitions.
- Persist delivery attempts and update aggregate status.

### Step 7 — Observability and hardening

- Add metrics endpoint.
- Add health endpoints.
- Add secure logging and config validation.

### Step 8 — Tests

- Unit tests for services and adapters.
- Integration tests for API + worker + DB.
- Verify no dependency on BullMQ/Redis.

---

## 15) Agent Acceptance Checklist

Implementation is acceptable only if all are true:

1. REST API can register endpoints and submit notifications.
2. Dispatch works via DB-backed job table (no Redis/BullMQ requirement).
3. Web Push, FCM, APNs adapters are implemented behind one interface.
4. Retry and terminal failure behavior are persisted and queryable.
5. Service contains no user-account management model.
6. API authentication is M2M via API keys.
7. `/health/live`, `/health/ready`, and metrics endpoint exist.
8. OpenAPI spec is generated for the REST API.

---

## 16) Guardrails for Agents

- Do not add timeline sections or schedule assumptions.
- Do not introduce queue infrastructure beyond PostgreSQL unless explicitly requested.
- Do not add user login/registration or user profile tables.
- Keep implementation minimal and operable for low-throughput environments.
- Prefer deterministic, testable code paths over distributed complexity.
