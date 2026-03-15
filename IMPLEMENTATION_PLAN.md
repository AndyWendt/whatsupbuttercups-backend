# Whatsupbuttercups Backend Implementation Plan

## Goal
Build a Cloudflare-backed API for Whatsupbuttercups with D1 as the system of record, KV only for short-lived support data, and Firebase Auth plus FCM integration. The backend must own authorization, recurrence expansion, streak math, weekly progress, reminder eligibility, vacation suppression, and notification dispatch orchestration.

## Target Stack
- Cloudflare Workers for the HTTP API
- Cloudflare D1 for canonical relational data
- Cloudflare KV for invite tokens, idempotency keys, reminder dedupe keys, and rate limiting
- Firebase Admin verification flow for Google sign-in tokens
- FCM send path for push notifications
- TypeScript
- Vitest for unit and integration-style tests
- Miniflare or Cloudflare local test tooling for Worker bindings
- Drizzle ORM or raw SQL migrations; prefer one migration system and keep it fixed for the repo

## Delivery Rules
- Every slice starts with a failing automated test.
- Only ship one behavior per commit.
- Do not mix schema changes, new endpoints, and reminder logic in the same commit unless the test requires all three to prove one behavior.
- Prefer contract tests at the HTTP layer for endpoint behavior and pure unit tests for recurrence, streak, and reminder calculations.
- Keep the `main` branch deployable after every commit.

## Project Layout
- `src/worker/` request handlers, middleware, route registration
- `src/domain/` recurrence, streak, weekly progress, reminder, vacation rules
- `src/data/` repositories and transaction helpers
- `src/auth/` Firebase token verification and session bootstrap
- `src/notifications/` FCM payload creation and dispatch orchestration
- `migrations/` D1 schema migrations
- `test/http/` request-level tests
- `test/domain/` business-rule tests
- `test/data/` repository and migration coverage

## TDD Implementation Slices

### Slice 1: Worker scaffold and health check
- Write a failing HTTP test for `GET /health`.
- Add Worker bootstrap, routing shell, and basic test harness.
- Commit: `backend: scaffold worker and health endpoint`

### Slice 2: D1 migration runner and baseline schema
- Write failing migration tests that assert core tables exist:
  `users`, `households`, `household_members`, `items`, `occurrence_completions`, `vacation_windows`, `device_registrations`, `household_invites`, `notification_events`.
- Add migration tooling and the first schema set.
- Commit: `backend: add baseline d1 schema`

### Slice 3: Firebase token verification and session bootstrap
- Write failing tests for valid token bootstrap, invalid token rejection, and first-login user creation.
- Implement auth middleware and `POST /session/verify`.
- Commit: `backend: add firebase session bootstrap`

### Slice 4: Profile read and update
- Write failing HTTP tests for `GET /me` and `PUT /me`.
- Implement profile repository and handlers.
- Commit: `backend: add profile endpoints`

### Slice 5: Household creation and membership bootstrap
- Write failing tests for creating a household and attaching the creator as admin.
- Implement household creation transaction and membership lookup.
- Commit: `backend: add household creation flow`

### Slice 6: Household invites
- Write failing tests for admin-only invite creation, token storage in KV, and invite acceptance.
- Implement `POST /household/invites` and `POST /household/join`.
- Commit: `backend: add household invite flow`

### Slice 7: Authorization guards
- Write failing tests for cross-household denial, member/admin role enforcement, and unauthenticated rejection.
- Implement reusable authorization middleware/policies.
- Commit: `backend: add household authorization rules`

### Slice 8: Item model and CRUD
- Write failing tests for creating personal and household items, editing allowed fields, and soft-deactivating items.
- Implement `GET /items`, `POST /items`, and `PATCH /items/:id`.
- Commit: `backend: add item crud`

### Slice 9: Recurrence engine
- Write failing domain tests for daily, weekly, and custom weekday recurrence expansion.
- Implement recurrence calculation utilities independent of HTTP.
- Commit: `backend: add recurrence engine`

### Slice 10: Daily agenda endpoint
- Write failing tests for `GET /agenda?date=...` covering personal items, assigned household items, and inactive items exclusion.
- Implement agenda query plus recurrence expansion composition.
- Commit: `backend: add daily agenda endpoint`

### Slice 11: Weekly target aggregation
- Write failing tests for `GET /week?start=...` with expected counts, completed counts, and progress percent.
- Implement weekly projection and aggregation logic.
- Commit: `backend: add weekly progress endpoint`

### Slice 12: Completion history writes
- Write failing tests for complete/uncomplete on arbitrary dates, idempotent completion writes, and authorization rules.
- Implement `POST /occurrences/complete` and `POST /occurrences/uncomplete`.
- Commit: `backend: add occurrence completion endpoints`

### Slice 13: Streak calculation
- Write failing domain tests for streak continuation, missed-day breaks, same-day idempotency, and weekly-target-aware streaks if enabled.
- Implement streak calculator and persistence strategy.
- Commit: `backend: add streak calculations`

### Slice 14: History edit recomputation
- Write failing tests showing that backfilling old dates recomputes streaks and weekly progress consistently.
- Implement recomputation hooks or derived-query strategy.
- Commit: `backend: recompute metrics after history edits`

### Slice 15: Vacation windows
- Write failing tests for creating vacation windows, overlapping-window validation, and streak suppression during vacation.
- Implement `GET /vacations` and `POST /vacations`.
- Commit: `backend: add vacation mode rules`

### Slice 16: Device registration
- Write failing tests for registering, updating, and deduplicating device tokens.
- Implement `POST /devices/register`.
- Commit: `backend: add device registration`

### Slice 17: Reminder eligibility engine
- Write failing domain tests for due reminders, nagging cadence, vacation suppression, quiet hours, and inactive items.
- Implement reminder eligibility calculator and dedupe key generation.
- Commit: `backend: add reminder eligibility engine`

### Slice 18: Reminder dispatch worker path
- Write failing tests for selecting due reminders, writing notification events, and building FCM payloads.
- Implement scheduled reminder dispatch flow.
- Commit: `backend: add reminder dispatch flow`

### Slice 19: Idempotency and retry safety
- Write failing tests for duplicate completion writes, repeated invite acceptance, and repeated reminder dispatch execution.
- Implement KV-backed idempotency and dedupe protections.
- Commit: `backend: add idempotency safeguards`

### Slice 20: Observability and error contracts
- Write failing tests for structured error payloads and request correlation IDs where practical.
- Implement consistent error mapping and logging hooks.
- Commit: `backend: add api error contracts and logging`

## Test Strategy
- Unit tests for recurrence, streaks, vacation suppression, and reminder cadence
- Repository tests against local D1 for transactional correctness
- HTTP tests for endpoint contracts, auth, and authorization
- Scheduler tests for due-reminder selection and dedupe behavior
- Migration tests to ensure fresh database bootstrap and upgrade path both work

## Definition of Done
- Fresh environment setup can run migrations, tests, and local Worker startup without manual database edits.
- All listed endpoints have automated coverage for success and rejection cases.
- Reminder and history-edit logic are covered by deterministic tests, not manual validation.
- Each merged commit represents one slim, reviewable slice with tests passing before merge.
