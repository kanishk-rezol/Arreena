# AetherSFU Data Model & Database Specification

## 1. Overview

The AetherSFU database schema is designed for **anonymous, short-lived video conferencing sessions** with high-throughput primary key generation and explicit audit timestamps.

* **Database Engine**: SQLite (Development: `backend/aethersfu.db`) / PostgreSQL 16 (Production).
* **ORM**: SQLAlchemy 2.0 (Async).

---

## 2. Distributed Snowflake ID Generator

Primary keys across all database tables use 64-bit time-ordered **Snowflake IDs** instead of standard UUIDv4 strings.

### Bit Structure

```text
 0                      41          51        63
 +----------------------+-----------+---------+
 | Timestamp (ms)       | DC / Node | Seq Num |
 +----------------------+-----------+---------+
```

* **41 bits**: Timestamp in milliseconds since Custom Epoch (`Jan 1, 2026 00:00:00 UTC` = `1767225600000`).
* **5 bits**: Datacenter ID (`0` to `31`).
* **5 bits**: Worker Node ID (`0` to `31`).
* **12 bits**: Sequence counter (`0` to `4095` per millisecond).

### Python Utility Methods ([`backend/aethersfu/db/snowflake.py`](file:///d:/video%20conferencing%20tool/backend/aethersfu/db/snowflake.py))
```python
from aethersfu.db.snowflake import generate_snowflake_id, parse_snowflake_timestamp

# Generate ID string:
snowflake_id = generate_snowflake_id()  # e.g., "82919093006635008"

# Extract creation timestamp:
created_at = parse_snowflake_timestamp(snowflake_id)  # e.g., 2026-08-18 01:04:46+00:00
```

---

## 3. Database Schemas

### `rooms` Table
Stores instant meeting room metadata.

| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | `VARCHAR(64)` | `PRIMARY KEY` | Snowflake ID string (e.g., `"82919093006635008"`) |
| `code` | `VARCHAR(64)` | `UNIQUE`, `INDEX` | Unguessable room code (e.g., `"a5ca-4ba5-0344"`) |
| `name` | `VARCHAR(128)` | `NOT NULL` | Room display title |
| `is_active` | `BOOLEAN` | `DEFAULT TRUE` | Active room status flag |
| `created_at` | `DATETIME` | `NOT NULL` | UTC creation timestamp |
| `updated_at` | `DATETIME` | `NOT NULL` | UTC last modification timestamp |
| `closed_at` | `DATETIME` | `NULLABLE` | UTC timestamp when room was closed |

---

### `anonymous_sessions` Table
Tracks short-lived participant session tokens joined to meeting rooms.

| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | `VARCHAR(64)` | `PRIMARY KEY` | Snowflake ID string |
| `session_token` | `VARCHAR(128)` | `UNIQUE`, `INDEX` | Secret token (e.g., `"sess_4qZn6Rii..."`) |
| `room_id` | `VARCHAR(64)` | `FOREIGN KEY(rooms.id)` | Associated room foreign key |
| `display_name` | `VARCHAR(64)` | `NOT NULL` | Participant display name |
| `created_at` | `DATETIME` | `NOT NULL` | UTC record creation timestamp |
| `updated_at` | `DATETIME` | `NOT NULL` | UTC last update timestamp |
| `joined_at` | `DATETIME` | `NOT NULL` | UTC timestamp when participant joined |
| `left_at` | `DATETIME` | `NULLABLE` | UTC timestamp when participant disconnected |

---

### `call_history` Table
Stores call duration and participant statistics for reporting and analytics.

| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | `VARCHAR(64)` | `PRIMARY KEY` | Snowflake ID string |
| `room_id` | `VARCHAR(64)` | `NOT NULL` | Target room ID |
| `participant_count` | `INTEGER` | `DEFAULT 0` | Peak participant count |
| `created_at` | `DATETIME` | `NOT NULL` | UTC record creation timestamp |
| `updated_at` | `DATETIME` | `NOT NULL` | UTC last update timestamp |
| `started_at` | `DATETIME` | `NOT NULL` | Call start timestamp |
| `ended_at` | `DATETIME` | `NULLABLE` | Call teardown timestamp |

---

### `lifecycle_events` Table
Audit log of system state transitions.

| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | `VARCHAR(64)` | `PRIMARY KEY` | Snowflake ID string |
| `room_id` | `VARCHAR(64)` | `NOT NULL` | Target room ID |
| `event_type` | `VARCHAR(64)` | `NOT NULL` | Event type (`room_created`, `participant_joined`, etc.) |
| `details` | `TEXT` | `NULLABLE` | Additional JSON/text metadata |
| `created_at` | `DATETIME` | `NOT NULL` | Event occurrence timestamp |
| `updated_at` | `DATETIME` | `NOT NULL` | Record modification timestamp |
