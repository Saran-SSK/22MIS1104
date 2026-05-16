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

# Stage 3 — query optimization and indexing

## Query review

The query is logically correct for fetching unread notifications for a single student, but it is not production-efficient at scale.

```sql
SELECT * FROM notifications
WHERE studentID = 1042 AND isRead = false
ORDER BY createdAt ASC;
```

It returns the right rows, but the implementation has several problems once the table reaches millions of rows.

## Why it becomes slow

- `SELECT *` reads all columns, increasing I/O and preventing the database from using covering indexes.
- Without an index on `(studentID, isRead, createdAt)`, Postgres must scan the table or a broad index and then sort the rows.
- `ORDER BY createdAt ASC` adds sorting work on the result set, which can spill to disk for large row counts.
- A missing composite index means the planner cannot efficiently filter by student and unread status together.

## Specific issues

- Full table scans: if the optimizer chooses a table scan, it will read all 5M rows instead of only the student’s partition.
- Sorting overhead: ordering after filtering on a large candidate set is expensive and may require a temp file.
- `SELECT *` inefficiency: it causes more data to be loaded than needed and can disable index-only scans.
- Missing indexes: the query needs both filter and ordering support to avoid repeated row lookups.

## Optimized indexing strategy

- create a composite index on the access pattern used by the query
- add partial indexes for the unread case
- keep indexes narrow and avoid indexing every column

## Recommended composite indexes

```sql
CREATE INDEX idx_notifications_student_unread_created
  ON notifications (studentID, isRead, createdAt ASC);

CREATE INDEX idx_notifications_student_type_created
  ON notifications (studentID, type, createdAt DESC);

CREATE INDEX idx_notifications_student_priority_created
  ON notifications (studentID, priority, createdAt DESC)
  WHERE priority = true;
```

These indexes support the common filters and ordering without indexing unnecessary data.

## Why indexing every column is bad

- Every index adds write cost on inserts and updates.
- More indexes mean more storage and more work for vacuuming.
- Wide indexes slow down insert throughput, which is critical for a notification stream.
- Build only indexes that match actual query patterns.

## Impact on inserts and storage

- Each new index increases insert latency because Postgres must maintain additional tree structures.
- Indexes consume disk space; a narrow composite index is cheaper than many single-column indexes.
- Partial indexes reduce storage by indexing only active rows such as `isRead = false`.

## Optimized query

```sql
SELECT id, type, title, body, createdAt
FROM notifications
WHERE studentID = 1042
  AND isRead = false
ORDER BY createdAt ASC;
```

If the composite index exists, Postgres can use an index scan and avoid a separate sort.

## Complexity analysis

- Original query without index: O(N + M log M), where N is table size and M is matching rows.
- With the right composite index: O(log N + M), where the scan is index-driven and `ORDER BY` is covered by the index.

## Recent placements query

```sql
SELECT studentID
FROM notifications
WHERE type = 'placements'
  AND createdAt >= now() - interval '7 days'
GROUP BY studentID;
```

For a stronger production pattern, add an index on `(type, createdAt DESC)` and push filters into the index scan.

## Practical takeaway

- Keep the hot query path narrow: filter by student, unread, and time or priority.
- Use composite indexes that match both `WHERE` and `ORDER BY` clauses.
- Avoid `SELECT *` on large tables; return only the columns the client needs.
- Balance index coverage with insert cost, especially in a write-heavy notification workload.

# Stage 4 — delivery scaling and reliability

## Scaling delivery efficiently

The system should separate incoming requests from delivery work. API servers accept notification events, validate payloads, and enqueue work for downstream workers instead of delivering notifications synchronously.

## Asynchronous processing and worker architecture

- Clients post notification events to the API.
- The API publishes messages to RabbitMQ exchanges.
- Worker processes consume queues and execute notification delivery, database updates, and cache invalidation.
- Workers are horizontally scalable and can be added during peak periods.

## Background jobs and message queues

- Use RabbitMQ for durable queueing, retry tracking, and backpressure.
- A notification producer writes to a queue such as `notifications.incoming`.
- A separate consumer group handles delivery to student channels and another updates unread counts.
- Queues decouple spikes from backend processing and make retries manageable.

## Why queues improve scalability and reliability

- Requests return quickly because message delivery is deferred.
- RabbitMQ smooths bursts by buffering work and letting workers pull at a controlled rate.
- Failed jobs can be moved to dead-letter queues for inspection and replay.
- Queues prevent the API from blocking on external services and keep the system resilient.

## Redis caching strategy

### Unread counts

- Keep per-user unread totals in Redis hashes or sorted data structures.
- Update counts atomically on `read` transitions and new notification inserts.
- Read counts directly from Redis instead of querying Postgres on every feed request.

### Recent notifications

- Cache the latest 10-20 notifications per user in Redis lists.
- Invalidate or refresh the cache when new notifications arrive or read state changes.
- This reduces pressure on the main notifications table for hot users.

### Priority notifications

- Cache priority notification IDs or small objects separately.
- Use a Redis sorted set keyed by user to support quick retrieval of priority alerts.
- Keep the cache small and refresh it on priority state changes only.

## Horizontal scaling and load balancing

- Run many API instances behind Nginx.
- Use Nginx as the edge load balancer with health checks and sticky session control disabled.
- Backend app servers should be stateless, with Redis and RabbitMQ as shared state.

## Handling placement season spikes

- Increase worker count and queue consumers ahead of known peak windows.
- Throttle non-critical jobs and prioritize delivery queue processing for unread counts and priority messages.
- Use burst-sized connection pools and temporary autoscaling on API and worker fleets.
- Cache as much read data as possible to keep the database load low during heavy traffic.

## Retry mechanisms

- Use RabbitMQ dead-letter exchanges for failed deliveries.
- Implement exponential backoff and a capped retry count per message.
- For permanent failures, persist a failure record and surface it to operations.

## API rate limiting

- Enforce per-user and per-IP rate limits at the Nginx or API gateway layer.
- Rate limit notification creation and fetch endpoints separately.
- Keep limits high enough for normal student activity but low enough to prevent abuse.

## Tradeoffs

- Queues add complexity but enable resilience under burst load.
- Redis caching improves read performance but requires careful invalidation.
- More workers reduce latency but increase operational cost.
- Horizontal scaling is effective for stateless APIs, but database writes still need careful coordination.

# Stage 5 — frontend architecture

## Frontend stack

The frontend is built with React and TypeScript, with Axios for HTTP integration and Material UI for consistent component styling.

## Component structure

- `NotificationList`: renders the main feed, handles pagination or virtualization, and coordinates filter state.
- `NotificationCard`: displays title, body, timestamp, read state, and priority badge.
- `FilterPanel`: exposes type filters, unread toggle, and priority shortcuts.
- `PriorityNotifications`: shows urgent alerts in a separate section with direct access.

## State management

- Use React Context API for app-wide state such as current user, notification filters, and unread counts.
- Keep local component state for UI-only concerns like open menu state and scroll position.
- Use a context provider to expose actions like `fetchNotifications`, `markRead`, and `refreshPriority`.

## API integration strategy

- Use Axios instances with base URL, auth headers, and interceptors.
- Keep API calls in a reusable service layer: `notificationApi.fetchNotifications()`, `notificationApi.markAsRead()`, `notificationApi.fetchPriority()`.
- Use typed request and response interfaces so the component layer only consumes typed data.

## Real-time updates

- Primary: WebSockets to receive new notifications and update the list in real time.
- Fallback: polling every 15 seconds for students who cannot maintain a WS connection.
- On socket message, update the notification context and refresh cached counts.

## Optimistic UI updates

- When marking read, update the card state locally immediately and send the API request in the background.
- Roll back the UI change only if the request fails.
- Keep the toast or inline error visible so the student knows if the update did not persist.

## Large list handling

- Use pagination or virtualization with a library like `react-window` when the list grows.
- Load initial pages first and fetch additional notifications on scroll or page change.
- Avoid rendering all notifications at once to keep frame rates stable.

## Performance optimization

- Memoize notification cards and filter values to prevent unnecessary re-renders.
- Use `useCallback` and `useMemo` for handler functions and derived lists.
- Cache recent notifications in local state and refresh only when the backend signals new data.
- Defer heavy rendering for off-screen list items via virtualization.

## Reusable hooks and folder structure

- `hooks/useNotifications.ts`: encapsulates fetch, filter, real-time subscription, and optimistic update logic.
- `hooks/useUnreadCount.ts`: exposes unread totals and refresh functions.
- `components/NotificationList`, `components/NotificationCard`, `components/FilterPanel`, `components/PriorityNotifications`.
- `services/notificationApi.ts` and `contexts/NotificationContext.tsx` for clean separation.

## Practical note

The frontend should stay simple while supporting real-time and offline-friendly behavior. React + TypeScript gives strong typing, Axios keeps API integration consistent, and Material UI accelerates a maintainable UI surface.

