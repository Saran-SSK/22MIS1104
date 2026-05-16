(# Stage 1 — API design

## Overview

Design for a campus notifications API focused on placements, events, and results. Stage 1 targets CRUD-style fetch and read operations, with pagination, filtering, and a lightweight real-time delivery option.

## Notification JSON schema

```json
{
	"id": "uuid",
	"user_id": "uuid",
	"type": "placements | events | results",
	"title": "string",
	"body": "string",
	"created_at": "ISO-8601 timestamp",
	"read": false,
	"priority": false,
	"source": "string (optional)",
	"metadata": { "object": "optional" }
}
```

## Pagination

- Endpoints that return lists must support `page` and `per_page` query parameters.
- Responses include a `meta` object with `page`, `per_page`, `total`, and `total_pages`.

## Endpoints

### 1) Fetch notifications

`GET /api/v1/notifications`

Headers

- `Authorization: Bearer <token>`
- `Accept: application/json`

Query parameters

- `page` (int, default 1)
- `per_page` (int, default 20, max 100)
- `type` (placements|events|results)
- `unread` (boolean)
- `priority` (boolean)
- `sort` (created_at|priority desc)

Response 200

```json
{
	"data": [ /* array of notification objects */ ],
	"meta": { "page":1, "per_page":20, "total":123, "total_pages":7 }
}
```

Status codes: `200`, `400` (bad params), `401` (unauth), `500` (server)

### 2) Fetch priority notifications

`GET /api/v1/notifications/priority`

Headers: same as above

Query parameters: `page`, `per_page`, optional `type`

Response 200: same structure as Fetch notifications, filtered to `priority: true`.

### 3) Fetch single notification

`GET /api/v1/notifications/:id`

Headers: `Authorization`

Response 200

```json
{ /* single notification object */ }
```

Status codes: `200`, `401`, `404`, `500`

### 4) Mark a notification as read

`PATCH /api/v1/notifications/:id/read`

Headers: `Authorization`, `Content-Type: application/json`

Request body

```json
{ "read": true }
```

Response 200

```json
{ "id": "uuid", "read": true }
```

Status codes: `200`, `400`, `401`, `404`, `500`

### 5) Mark all notifications as read

`PATCH /api/v1/notifications/mark_all_read`

Headers: `Authorization`, `Content-Type: application/json`

Request body (optional filters)

```json
{ "type": "placements", "before": "2026-05-16T00:00:00Z" }
```

Response 200

```json
{ "updated_count": 42 }
```

Status codes: `200`, `400`, `401`, `500`

### 6) Filter by notification type

Covered via `GET /api/v1/notifications?type=placements` (see Fetch notifications)

## Request / Response examples

- Example fetch request

```
GET /api/v1/notifications?page=1&per_page=20&type=placements&unread=true
Authorization: Bearer <token>
```

- Example mark read

```
PATCH /api/v1/notifications/123e4567/read
Content-Type: application/json
Authorization: Bearer <token>

{ "read": true }
```

## Real-time delivery suggestion

- Primary: WebSocket-based user channels. Clients open an authenticated WS connection to `/ws/notifications` and receive pushed notification objects.
- Fallback: Server-Sent Events (SSE) for browsers that prefer HTTP streaming.
- Delivery pipeline: application instances publish new notification events to a durable message bus (Kafka/RabbitMQ). A notification service subscribes and fan-outs events to user channels using Redis Pub/Sub for low-latency cross-process delivery.

## Scalability considerations

- Store notifications in a write-optimized store (Postgres partitioned by user_id or a dedicated notifications service backed by Cassandra/Scylla for very large scale).
- Use proper indexes on `(user_id, created_at, read)` and partial indexes for `unread` to speed queries.
- Keep unread counts in Redis for O(1) reads and update them transactionally when marking read.
- Batch writes and fan-out through a message queue to avoid thundering herd when sending to many devices.
- Add rate limiting and backpressure on the real-time layer; authenticate WS connections and enforce per-user connections limits.

## Notes

- Use consistent timestamps (UTC ISO-8601).
- Prefer idempotent operations for mark-all-read via an idempotency key when exposed to clients.
- Monitor queue lag and DB hotspots; add horizontal partitions or read replicas as load grows.

# Stage 2 — Data persistence and scaling

## Database choice

PostgreSQL is the selected persistent store for Stage 2. It provides strong transactional guarantees, good support for JSON metadata, and built-in partitioning and indexing features that fit the notification workload.

## Why PostgreSQL

- reliable ACID behavior for read status updates
- rich index support for composite and partial indexes
- mature partitioning and connection pooling
- good fit for campus-scale traffic with write-heavy notification inserts

## Schema design

Main table:

```sql
CREATE TABLE notifications (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  type notification_type NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  read boolean NOT NULL DEFAULT false,
  priority boolean NOT NULL DEFAULT false,
  source text,
  metadata jsonb,
  archived boolean NOT NULL DEFAULT false
);
```

Supporting types and tables:

```sql
CREATE TYPE notification_type AS ENUM ('placements', 'events', 'results');

CREATE TABLE users (
  id uuid PRIMARY KEY,
  email text UNIQUE NOT NULL,
  display_name text
);
```

## Relationships and indexes

- `notifications.user_id` references `users.id`.
- Partition notifications by `created_at` or by `user_id` range for scale.
- Add indexes:
  - `CREATE INDEX idx_notifications_user_created ON notifications (user_id, created_at DESC);`
  - `CREATE INDEX idx_notifications_unread ON notifications (user_id, read) WHERE read = false;`
  - `CREATE INDEX idx_notifications_type ON notifications (user_id, type, created_at DESC);`
  - `CREATE INDEX idx_notifications_priority ON notifications (user_id, priority, created_at DESC);`

Use partial indexes to keep unread queries efficient and avoid full-table scans.

## Scaling concerns

As notification volume grows, the main risks are table size growth, read latency for user feeds, and update contention on read status.

### Indexing

- Keep indexes narrow and query-specific.
- Use partial indexes for `read = false` and `priority = true`.
- Avoid indexing high-cardinality JSON fields; store queryable labels in dedicated columns.

### Pagination

- Prefer keyset pagination for feed queries after an initial page.
- Example cursor fields: `(created_at DESC, id)`.
- Support offset pagination only for low-volume admin or archive views.

### Partitioning

- Use range partitioning on `created_at` for time-based retention.
- Consider hash partitioning on `user_id` when individual user history is very large.
- Keep partitions manageable, e.g. monthly or quarterly.

### Caching

- Cache user notification summaries and unread counts in Redis.
- Store the most recent page of notifications per user in a fast cache, invalidated when new messages arrive.
- Use read-through cache for priority notification queries.

### Archiving

- Move old notifications to an archive table on a schedule.
- Archive criteria: `created_at < now() - interval '90 days'` or `archived = true`.
- Keep active table lean for fast user queries and use archive queries only for compliance or history lookups.

## SQL examples

Fetch unread notifications:

```sql
SELECT id, type, title, body, created_at, priority
FROM notifications
WHERE user_id = $1
  AND read = false
  AND archived = false
ORDER BY created_at DESC
LIMIT $2;
```

Filter by notification type:

```sql
SELECT id, type, title, body, created_at, read, priority
FROM notifications
WHERE user_id = $1
  AND type = $2
  AND archived = false
ORDER BY created_at DESC
LIMIT $3 OFFSET $4;
```

Mark a notification as read:

```sql
UPDATE notifications
SET read = true
WHERE id = $1
  AND user_id = $2
  AND archived = false;
```

Fetch priority notifications:

```sql
SELECT id, type, title, body, created_at
FROM notifications
WHERE user_id = $1
  AND priority = true
  AND archived = false
ORDER BY created_at DESC
LIMIT $2;
```

## Practical notes

- Keep the active notification table compact with partial indexes and an archive pipeline.
- Use a dedicated notification worker to move old rows into archive partitions or a separate table.
- For high concurrency, use connection pooling and keep update statements simple so read-status writes do not block feed reads.

