# WhatsUpButtercups Backend API

Base URL (production): `https://whatsupbuttercups.com`

## Authentication

- `POST /session/verify` accepts a Firebase ID token and returns/bootstraps the app user.
- All protected endpoints require `Authorization: Bearer <firebase-id-token>`.

## Error Contract

JSON errors use this shape:

```json
{
  "error": "bad_request|unauthorized|forbidden|conflict|internal_error|unavailable",
  "message": "human readable message",
  "correlation_id": "request-id"
}
```

Notes:
- `correlation_id` is included on JSON error responses.
- Unknown routes return `404 Not Found` as plain text.

## Endpoint Summary

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| GET | `/health` | No | Service health |
| POST | `/session/verify` | No | Verify Firebase token + bootstrap user |
| GET | `/me` | Yes | Get current profile |
| PUT | `/me` | Yes | Update current profile |
| POST | `/household` or `/households` | Yes | Create household + add caller as admin |
| POST | `/household/invites` | Yes | Create invite token (admin only) |
| POST | `/household/join` | Yes | Join household via invite token |
| GET | `/items` | Yes | List visible items |
| POST | `/items` | Yes | Create item |
| PATCH | `/items/:id` | Yes | Update item fields |
| POST | `/occurrences/complete` | Yes | Mark occurrence complete |
| POST | `/occurrences/uncomplete` | Yes | Remove occurrence completion |
| GET | `/agenda?date=YYYY-MM-DD` | Yes | List due items for a date |
| GET | `/week?start=YYYY-MM-DD` | Yes | Week progress rollup |
| GET | `/vacations` | Yes | List vacation windows |
| POST | `/vacations` | Yes | Create vacation window |
| POST | `/devices/register` | Yes | Register/update push device token |
| GET | `/reminders/due` | Yes | Compute due reminders |
| POST | `/reminders/dispatch` | Yes | Persist + optionally push reminder events |

## Endpoint Details

### GET `/health`

Response `200`:

```json
{
  "service": "whatsupbuttercups-backend",
  "status": "ok",
  "timestamp": "2026-03-15T03:14:21.093Z"
}
```

### POST `/session/verify`

Request body:

```json
{
  "token": "<firebase-id-token>"
}
```

Success `200`:

```json
{
  "user": {
    "id": "user-uid-001",
    "firebase_uid": "uid-001",
    "email": "first@example.com",
    "display_name": "First User",
    "created_at": "2026-03-15T00:00:00.000Z"
  }
}
```

### GET `/me`

Returns current user profile.

### PUT `/me`

Request body supports:

```json
{
  "display_name": "Updated Name",
  "email": "updated@example.com"
}
```

At least one of `display_name` or `email` is required.

### POST `/household` (or `/households`)

Request:

```json
{
  "name": "My Place"
}
```

Success `201`:

```json
{
  "household": {
    "id": "uuid",
    "name": "My Place",
    "creator_user_id": "user-id",
    "created_at": "iso",
    "updated_at": "iso"
  },
  "member": {
    "household_id": "uuid",
    "user_id": "user-id",
    "role": "admin"
  }
}
```

### POST `/household/invites`

Admin-only invite creation.

Request:

```json
{
  "household_id": "household-uuid",
  "invitee_email": "optional@example.com"
}
```

Success `201` returns `{ "invite": { ... } }` with `token`, `status: "pending"`.

### POST `/household/join`

Request:

```json
{
  "token": "invite-token"
}
```

Responses:
- `201` when accepted and membership created.
- `200` idempotent when already accepted by same user.
- `409` if invite is not pending.
- `403` if invite email is bound to a different user email.

### GET `/items`

Returns visible personal + household items:

```json
{
  "items": [
    {
      "id": "item-1",
      "household_id": null,
      "owner_user_id": "user-id",
      "title": "Read",
      "recurrence": "daily",
      "is_active": 1
    }
  ]
}
```

### POST `/items`

Request:

```json
{
  "title": "Read",
  "recurrence": "daily",
  "household_id": "optional-household-id"
}
```

`title` and `recurrence` are required.

### PATCH `/items/:id`

Supported fields:

```json
{
  "title": "Read Bible",
  "recurrence": "weekly",
  "is_active": false
}
```

`is_active` is persisted as `1/0`.

### POST `/occurrences/complete`

Request:

```json
{
  "item_id": "item-1",
  "date": "2026-03-10"
}
```

Responses:
- `201` on first completion.
- `200` idempotent if already completed.

### POST `/occurrences/uncomplete`

Same request body as complete; returns `200` with `{ "completion": null }` (idempotent).

### GET `/agenda?date=YYYY-MM-DD`

Returns active items due on the requested date:

```json
{
  "date": "2026-03-09",
  "items": [
    {
      "id": "item-id",
      "title": "Read",
      "recurrence": "daily",
      "household_id": null,
      "owner_user_id": "user-id"
    }
  ]
}
```

### GET `/week?start=YYYY-MM-DD`

Returns:

```json
{
  "start": "2026-03-02",
  "end": "2026-03-08",
  "expected_count": 8,
  "completed_count": 4,
  "progress_percent": 50
}
```

### GET `/vacations`

Returns:

```json
{
  "windows": [
    {
      "id": "vacation-id",
      "user_id": "user-id",
      "starts_at": "2026-03-20",
      "ends_at": "2026-03-22"
    }
  ]
}
```

### POST `/vacations`

Request:

```json
{
  "starts_at": "2026-03-20",
  "ends_at": "2026-03-22"
}
```

Responses:
- `201` on create.
- `409` if overlaps an existing window.

### POST `/devices/register`

Request:

```json
{
  "device_token": "fcm-token",
  "platform": "android"
}
```

Responses:
- `201` when inserted.
- `200` when updated for same user/device token.
- `409` if token belongs to another user.

### GET `/reminders/due`

Query params:
- `as_of` optional ISO timestamp (defaults to now).

Response:

```json
{
  "due_on": "2026-03-10",
  "reminders": [
    {
      "item_id": "item-1",
      "due_on": "2026-03-10"
    }
  ]
}
```

### POST `/reminders/dispatch`

Query params:
- `as_of` optional ISO timestamp.
- `user_id` optional, defaults to current authenticated user id.

Response:

```json
{
  "dispatched": 1,
  "events": [
    {
      "id": "event-id",
      "item_id": "item-1",
      "event_type": "reminder",
      "push_targets": 1,
      "payload": {
        "notification": {
          "title": "Task reminder",
          "body": "Reminder for Read"
        },
        "data": {
          "item_id": "item-1",
          "due_on": "2026-03-10",
          "user_id": "user-id"
        }
      }
    }
  ]
}
```

Dispatch is deduplicated per `user + item + due_date`.

## Recurrence Notes

Current recurrence parser supports:
- `"daily"`
- `"weekly"`
- JSON string/object with `weekdays` for custom weekday rules (0=Sunday..6=Saturday)
