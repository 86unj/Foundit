# FoundIt — Database

> PRJ566 NCC · Team 02 · Database & Documentation Lead: Hansol Nam

PostgreSQL schema for the **Seneca Campus Lost & Found System**.

> **This Docker setup starts a clean, empty database.**  
> No data is pre-loaded. To populate the database with schema and seed data, run Prisma Migrate and the seed script from the `backend/` directory after starting the container — see [Setup](#setup) below.

> **Schema and seed data are managed by Prisma Migrate** (in `backend/`).  
> The raw SQL files have been moved to `archive/` for reference only — do not apply them manually.

---

## Structure

```
database/
├── docker-compose.yml       # PostgreSQL + pgAdmin services
├── pgadmin/
│   └── servers.json         # pgAdmin pre-registered server config
├── archive/                 # Legacy SQL files (reference only)
│   ├── schema.sql
│   ├── seed.sql
│   └── sample-data.sql
└── README.md
```

Schema is defined in `backend/prisma/schema.prisma`.  
Seed data is in `backend/prisma/seed.ts`.

---

## Setup

### First time (or after a full reset)

**Step 1 — Start the database** (from `database/`)

```bash
cd database
docker compose up -d
```

**Step 2 — Apply schema + seed** (from `backend/`)

```bash
cd backend
pnpm exec prisma migrate dev
NODE_ENV=development pnpm exec prisma db seed
```

**Why `NODE_ENV=development`?**

> The seed script checks this variable to decide whether to insert dev-only sample data (alice, bob, carol + sample records).  
> Setting it to `development` explicitly inserts everything. Setting it to `production` inserts only the admin account — safe for real deployments.  
> On a local machine where `NODE_ENV` is usually unset, omitting it works the same as `development`, but being explicit makes the intent clear.

That's it. The database is ready.

---

## Reset Everything

Wipes all data and starts completely fresh:

```bash
# From database/
cd database && docker compose down -v && docker compose up -d

# From backend/
cd backend && pnpm exec prisma migrate dev && NODE_ENV=development pnpm exec prisma db seed
```

---

## Seed Accounts

After seeding, the following accounts are available:

| Role     | Email               | Password     | Notes                            |
| -------- | ------------------- | ------------ | -------------------------------- |
| Admin    | `admin@myseneca.ca` | `Admin@1234` | Always seeded                    |
| Student  | `alice@myseneca.ca` | `Test1234!`  | Dev only (`NODE_ENV≠production`) |
| Student  | `bob@myseneca.ca`   | `Test1234!`  | Dev only                         |
| Security | `carol@myseneca.ca` | `Test1234!`  | Dev only                         |

Dev sample data also includes: 1 report link · 1 found item report · 1 item · 1 claim.

> Change the admin password before deploying to any shared or production environment.

---

## pgAdmin

Visual database browser at **http://localhost:5050**

| Field    | Value             |
| -------- | ----------------- |
| Email    | `admin@admin.com` |
| Password | `admin123`        |

The **Foundit Local** server is pre-registered. Enter the DB password (`foundit123`) when prompted on first connect — it will be remembered for the session.

---

## Schema Overview

The database is built on **PostgreSQL** and uses the `uuid-ossp` extension for UUID primary keys.

### Enums

| Enum                    | Values                                                                       |
| ----------------------- | ---------------------------------------------------------------------------- |
| `user_role`             | `student`, `security`, `admin`                                               |
| `item_status`           | `pending_report`, `stored`, `claimed`, `expired`, `disposed`                 |
| `claim_status`          | `submitted`, `under_review`, `approved`, `rejected`, `picked_up`             |
| `found_report_status`   | `submitted`, `processed`, `linked_to_item`                                   |
| `match_status`          | `suggested`, `confirmed`, `rejected`, `dismissed`                            |
| `notification_type`     | `claim_status_update`, `match_found`, `item_expiring`, `report_confirmation` |
| `email_delivery_status` | `not_sent`, `sent`, `delivered`, `failed`                                    |

### Tables

#### `campus`

Stores each Seneca campus location. The `retention_days` field controls how long an item is kept before expiry (default: 30 days, configurable up to 90).

| Column           | Type         | Notes                                   |
| ---------------- | ------------ | --------------------------------------- |
| `campus_id`      | UUID PK      | Auto-generated                          |
| `campus_name`    | VARCHAR(100) | Unique (e.g., `Newnham`, `Seneca@York`) |
| `address`        | VARCHAR(255) |                                         |
| `retention_days` | INT          | Default 30                              |

**Seeded campuses:** Newnham · Seneca@York · King · Peterborough

---

#### `user`

All platform users — students, security staff, and admins.

| Column                          | Type               | Notes                                                    |
| ------------------------------- | ------------------ | -------------------------------------------------------- |
| `user_id`                       | UUID PK            |                                                          |
| `campus_id`                     | UUID FK → `campus` | `SET NULL` on campus delete                              |
| `email`                         | VARCHAR(255)       | Unique                                                   |
| `username`                      | VARCHAR(255)       | Unique                                                   |
| `password_hash`                 | VARCHAR(255)       | bcrypt                                                   |
| `role`                          | `user_role`        | `student` / `security` / `admin` (BR2)                   |
| `student_number`                | BIGINT             | Students only; 9-digit range (BR14)                      |
| `employee_id`                   | VARCHAR(12)        | Security staff only                                      |
| `phone`                         | VARCHAR(10)        |                                                          |
| `email_notification_opt_in`     | BOOLEAN            | Default `FALSE` (BR18)                                   |
| `is_active`                     | BOOLEAN            | Default `TRUE`                                           |
| `is_email_verified`             | BOOLEAN            | Default `FALSE` — set to `TRUE` after email verification |
| `email_verify_token`            | VARCHAR(255)       | Nullable — cleared after verification                    |
| `email_verify_token_expires_at` | TIMESTAMP          | Nullable — 24 hours after registration                   |

**Indexes:** `idx_user_student_number` (partial, where not null), `idx_user_campus_id`

---

#### `report_link`

One-time QR/URL tokens generated by security staff that allow finders to submit a found-item report (BR10).

| Column         | Type               | Notes                     |
| -------------- | ------------------ | ------------------------- |
| `link_id`      | UUID PK            |                           |
| `token`        | VARCHAR(255)       | Unique                    |
| `generated_by` | UUID FK → `user`   | Must be security or admin |
| `campus_id`    | UUID FK → `campus` |                           |
| `expires_at`   | TIMESTAMP          | Required (BR10)           |
| `is_used`      | BOOLEAN            | Default `FALSE`           |
| `used_at`      | TIMESTAMP          | Set when consumed         |

---

#### `found_item_report`

A report submitted by a finder (student/staff) via a `report_link` token.

| Column             | Type                    | Notes               |
| ------------------ | ----------------------- | ------------------- |
| `report_id`        | UUID PK                 |                     |
| `report_link_id`   | UUID FK → `report_link` |                     |
| `finder_id`        | UUID FK → `user`        |                     |
| `item_description` | TEXT                    |                     |
| `category`         | VARCHAR(50)             |                     |
| `location_found`   | VARCHAR(100)            |                     |
| `date_found`       | DATE                    |                     |
| `time_found`       | TIME                    | Optional            |
| `additional_notes` | TEXT                    | Optional            |
| `status`           | `found_report_status`   | Default `submitted` |

---

#### `item`

An item that has been physically logged by security staff. May be linked to a `found_item_report`.

| Column                  | Type                          | Notes                                          |
| ----------------------- | ----------------------------- | ---------------------------------------------- |
| `item_id`               | UUID PK                       |                                                |
| `campus_id`             | UUID FK → `campus`            |                                                |
| `category`              | VARCHAR(50)                   |                                                |
| `title`                 | VARCHAR(100)                  | Public-facing name (BR7)                       |
| `description_public`    | VARCHAR(255)                  | Limited info for students (BR7)                |
| `description_internal`  | TEXT                          | Full details for security only (BR12)          |
| `color`                 | VARCHAR(30)                   |                                                |
| `brand`                 | VARCHAR(50)                   |                                                |
| `location_found`        | VARCHAR(255)                  |                                                |
| `date_found`            | DATE                          |                                                |
| `status`                | `item_status`                 | Default `pending_report`                       |
| `found_item_report_id`  | UUID FK → `found_item_report` | Optional                                       |
| `registered_by`         | UUID FK → `user`              |                                                |
| `retention_expiry_date` | DATE                          | Computed: `date_found + campus.retention_days` |

**Indexes:** campus, category, status, date_found, retention_expiry_date

**Auto-update trigger:** `updated_at` is refreshed automatically on every UPDATE.

---

#### `claim`

A lost-item claim submitted by a student. May be linked to a specific `item` after a match.

| Column             | Type               | Notes                             |
| ------------------ | ------------------ | --------------------------------- |
| `claim_id`         | UUID PK            |                                   |
| `student_id`       | UUID FK → `user`   | Must be a student                 |
| `item_id`          | UUID FK → `item`   | Nullable — set after matching     |
| `campus_id`        | UUID FK → `campus` |                                   |
| `category`         | VARCHAR(50)        |                                   |
| `description`      | TEXT               | Required (BR4)                    |
| `date_lost`        | DATE               | Optional                          |
| `location_lost`    | VARCHAR(255)       | Optional                          |
| `status`           | `claim_status`     | Default `submitted` (BR19)        |
| `reviewed_by`      | UUID FK → `user`   | Security/admin reviewer           |
| `reviewed_at`      | TIMESTAMP          |                                   |
| `rejection_reason` | TEXT               | Populated on rejection            |
| `picked_up_at`     | TIMESTAMP          | Set when item is collected (BR15) |
| `verified_by`      | UUID FK → `user`   | Student identity verified (BR14)  |

**Auto-update trigger:** `updated_at` is refreshed automatically on every UPDATE.

---

#### `item_image`

Images attached to either an `item` or a `claim` (BR6: JPG/PNG only, size-limited).

| Column         | Type              | Notes                                              |
| -------------- | ----------------- | -------------------------------------------------- |
| `image_id`     | UUID PK           |                                                    |
| `item_id`      | UUID FK → `item`  | At least one of `item_id` / `claim_id` must be set |
| `claim_id`     | UUID FK → `claim` |                                                    |
| `image_url`    | VARCHAR(500)      |                                                    |
| `uploaded_by`  | UUID FK → `user`  |                                                    |
| `file_type`    | VARCHAR(10)       | `jpg` or `png` (BR6)                               |
| `file_size_kb` | INT               | Enforced at application layer (BR6)                |

**Constraint:** `item_image_target_check` — either `item_id` or `claim_id` must be non-null.  
**Cascade:** `ON DELETE CASCADE` from both `item` and `claim`.

---

#### `match_suggestion`

AI/algorithm-generated suggestions linking a claim to a potential item.

| Column           | Type              | Notes                      |
| ---------------- | ----------------- | -------------------------- |
| `match_id`       | UUID PK           |                            |
| `claim_id`       | UUID FK → `claim` |                            |
| `item_id`        | UUID FK → `item`  |                            |
| `match_score`    | DECIMAL(5,2)      | 0.00–100.00                |
| `match_criteria` | TEXT              | Human-readable explanation |
| `status`         | `match_status`    | Default `suggested`        |
| `reviewed_by`    | UUID FK → `user`  |                            |
| `reviewed_at`    | TIMESTAMP         |                            |

**Unique constraint:** `(claim_id, item_id)` — one suggestion per claim–item pair.

---

#### `notification`

In-app and email notifications sent to users.

| Column                  | Type                    | Notes                        |
| ----------------------- | ----------------------- | ---------------------------- |
| `notification_id`       | UUID PK                 |                              |
| `recipient_id`          | UUID FK → `user`        |                              |
| `type`                  | `notification_type`     |                              |
| `title`                 | VARCHAR(255)            |                              |
| `message`               | TEXT                    |                              |
| `reference_type`        | VARCHAR(50)             | `claim` / `item` / `report`  |
| `reference_id`          | UUID                    | Points to the related record |
| `is_read`               | BOOLEAN                 | Default `FALSE`              |
| `email_sent`            | BOOLEAN                 | Default `FALSE`              |
| `email_delivery_status` | `email_delivery_status` | Default `not_sent`           |

**Indexes:** `idx_notification_recipient`, `idx_notification_is_read`

---

#### `audit_log`

Append-only log of all significant actions. **No UPDATE or DELETE should ever run on this table.**

| Column        | Type             | Notes                                                |
| ------------- | ---------------- | ---------------------------------------------------- |
| `log_id`      | UUID PK          |                                                      |
| `actor_id`    | UUID FK → `user` | `NULL` for system-initiated actions                  |
| `action`      | VARCHAR(100)     | e.g., `item_created`, `claim_approved`               |
| `entity_type` | VARCHAR(50)      | `item` / `claim` / `report` / `user` / `report_link` |
| `entity_id`   | UUID             | ID of the affected record                            |
| `details`     | JSON             | Additional context                                   |
| `ip_address`  | VARCHAR(45)      | IPv4 or IPv6                                         |

**Indexes:** actor, entity (type + id), action, created_at

---

## 🔗 Entity Relationships

```
campus ──< user
campus ──< item
campus ──< claim
campus ──< report_link

user (security) ──< report_link ──< found_item_report
user (student)  ──< found_item_report

found_item_report ──o item
item ──< item_image
item ──< match_suggestion

user (student) ──< claim
claim ──< item_image
claim ──< match_suggestion

user ──< notification
user ──< audit_log
```

---

## Design Decisions

- **UUID primary keys** — used everywhere for security (non-guessable IDs) and future distributed-system compatibility.
- **Dual description fields on `item`** — `description_public` is shown to students; `description_internal` is security-only, protecting sensitive details from being exploited (BR7, BR12).
- **`report_link` token flow** — security staff generate a QR-code link; finders use it to submit reports without needing a full account (BR10).
- **`retention_expiry_date` is app-computed** — the application sets this when registering an item (`date_found + campus.retention_days`). Daily cron `expireRetainedItems` flips eligible items to `expired`.
- **`audit_log` is append-only** — no triggers auto-delete rows; all deletions of other records must write an audit entry first.
- **`item_image` polymorphic target** — an image can belong to an item or a claim (but not neither), enforced with a `CHECK` constraint.
- **Email verification on registration** — new accounts are created with `is_email_verified = FALSE`. A token is emailed to the user; clicking the link sets `is_email_verified = TRUE` and clears the token. Unverified accounts older than 1 day are automatically deleted by a scheduled cron job.

---
