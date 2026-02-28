# Bitespeed Identity Reconciliation

[![Node.js](https://img.shields.io/badge/Node.js-v18+-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)](https://typescriptlang.org)
[![Express](https://img.shields.io/badge/Express-5.x-000000?logo=express&logoColor=white)](https://expressjs.com)
[![Prisma](https://img.shields.io/badge/Prisma-7.4-2D3748?logo=prisma&logoColor=white)](https://prisma.io)
[![SQLite](https://img.shields.io/badge/SQLite-LibSQL-003B57?logo=sqlite&logoColor=white)](https://sqlite.org)
[![Tests](https://img.shields.io/badge/Tests-16%20passing-brightgreen?logo=jest)](./tests/identify.test.ts)
[![Live](https://img.shields.io/badge/Live-Render-46E3B7?logo=render&logoColor=white)](https://bitespeed-backend-xpj2.onrender.com)

> A REST service that links a customer's multiple contact records (different emails/phones used across purchases) into a single consolidated identity.

---

## Live API

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | [`/identify`](https://bitespeed-backend-xpj2.onrender.com/identify) | Reconcile contact identity |
| `GET`  | [`/contacts`](https://bitespeed-backend-xpj2.onrender.com/contacts) | View all stored contacts |
| `GET`  | [`/`](https://bitespeed-backend-xpj2.onrender.com/) | Health check |

---

## The Problem

FluxKart.com wants to recognize the same customer across multiple purchases, even when they use different emails or phone numbers each time.

```
Purchase 1:  email=lorraine@hillvalley.edu  phone=123456
Purchase 2:  email=mcfly@hillvalley.edu     phone=123456  ← same phone

These are the same person. They should be linked.
```

This service solves that by maintaining a graph of linked contacts with a clear **primary/secondary** hierarchy.

---

## How It Works

```
POST /identify  { email?, phoneNumber? }
        │
        ▼
┌───────────────────┐
│  Any match in DB? │
└───────────────────┘
     │           │
    NO           YES
     │           │
     ▼           ▼
  Create      Load all
  PRIMARY     matching clusters
  contact         │
     │            ▼
     │     Multiple primaries?
     │       │           │
     │      YES           NO
     │       │             │
     │       ▼             ▼
     │  Oldest stays    Single primary
     │  primary; rest   already determined
     │  demoted to
     │  secondary
     │           │
     │           ▼
     │    New email/phone
     │    in request?
     │       │       │
     │      YES       NO
     │       │         │
     │       ▼         ▼
     │  Create new   Return
     │  SECONDARY    consolidated
     │  contact      response
     │       │
     └───────┴──► Consolidated response
```

---

## API Reference

### `POST /identify`

**Request**

```json
{
  "email": "lorraine@hillvalley.edu",
  "phoneNumber": "123456"
}
```

> At least one field is required. `phoneNumber` accepts both `string` and `number`.

**Response** `200 OK`

```json
{
  "contact": {
    "primaryContatctId": 1,
    "emails": ["lorraine@hillvalley.edu", "mcfly@hillvalley.edu"],
    "phoneNumbers": ["123456"],
    "secondaryContactIds": [23]
  }
}
```

**Errors**

| Status | Condition | Body |
|--------|-----------|------|
| `400` | Missing email and phone | `{"error": "email or phoneNumber is required"}` |
| `400` | Invalid email format | `{"error": "invalid email format"}` |
| `500` | Server/database error | `{"error": "Internal server error"}` |

---

## Scenarios

### Scenario 1 — New customer

First time this email+phone is seen. A primary contact is created.

```bash
curl -X POST https://bitespeed-backend-xpj2.onrender.com/identify \
  -H "Content-Type: application/json" \
  -d '{"email": "lorraine@hillvalley.edu", "phoneNumber": "123456"}'
```

```json
{
  "contact": {
    "primaryContatctId": 1,
    "emails": ["lorraine@hillvalley.edu"],
    "phoneNumbers": ["123456"],
    "secondaryContactIds": []
  }
}
```

---

### Scenario 2 — Returning customer with a new email

Same phone `123456` but a different email. A secondary contact is created and linked to the primary.

```bash
curl -X POST https://bitespeed-backend-xpj2.onrender.com/identify \
  -H "Content-Type: application/json" \
  -d '{"email": "mcfly@hillvalley.edu", "phoneNumber": "123456"}'
```

```json
{
  "contact": {
    "primaryContatctId": 1,
    "emails": ["lorraine@hillvalley.edu", "mcfly@hillvalley.edu"],
    "phoneNumbers": ["123456"],
    "secondaryContactIds": [23]
  }
}
```

---

### Scenario 3 — Two primaries that get merged

**Before:** Two completely separate customers.

| id | email | phone | precedence |
|----|-------|-------|------------|
| 11 | george@hillvalley.edu | 919191 | primary |
| 27 | biffsucks@hillvalley.edu | 717171 | primary |

**Linking request:** George's email + Biff's phone (bridging both clusters).

```bash
curl -X POST https://bitespeed-backend-xpj2.onrender.com/identify \
  -H "Content-Type: application/json" \
  -d '{"email": "george@hillvalley.edu", "phoneNumber": "717171"}'
```

**After:** Older contact stays primary. Newer is demoted.

```json
{
  "contact": {
    "primaryContatctId": 11,
    "emails": ["george@hillvalley.edu", "biffsucks@hillvalley.edu"],
    "phoneNumbers": ["919191", "717171"],
    "secondaryContactIds": [27]
  }
}
```

---

## Tests

16 tests across 5 suites covering all key behaviours:

```
  Input Validation
    ✓ returns 400 when both email and phoneNumber are missing
    ✓ returns 400 for invalid email format
    ✓ returns 400 for empty string email
    ✓ accepts phoneNumber as a number type (spec requirement)
    ✓ trims whitespace from email before processing

  New Customer
    ✓ creates a new primary contact when no match exists
    ✓ creates a primary contact with only email
    ✓ creates a primary contact with only phone

  Existing Customer — Secondary Contact Creation
    ✓ links new email to existing primary via matching phone
    ✓ links new phone to existing primary via matching email
    ✓ does NOT create duplicate secondary for existing email+phone combo

  Primary Contact Turns Into Secondary (Cluster Merging)
    ✓ demotes the newer primary when two clusters are linked
    ✓ primary email appears first in emails array
    ✓ re-parents orphaned secondaries when their primary is demoted

  Response Shape
    ✓ response always has the correct keys
    ✓ no duplicate emails or phone numbers in response

Tests: 16 passed, 16 total
```

Run tests:

```bash
npm test
```

---

## Tech Stack

| Technology | Version | Purpose |
|------------|---------|---------|
| **Node.js** | v18+ | Runtime |
| **TypeScript** | 5.9 | Type-safe development, strict mode |
| **Express** | v5 | HTTP framework |
| **Prisma** | v7 | ORM, schema management |
| **SQLite (LibSQL)** | — | Lightweight relational database |
| **Morgan** | — | HTTP request logging |
| **Jest + Supertest** | — | Integration testing |

---

## Project Structure

```
src/
  index.ts              # Express server, middleware stack, health check
  db.ts                 # Prisma client singleton (LibSQL adapter)
  routes/
    identify.ts         # POST /identify — full reconciliation logic (8 steps)
prisma/
  schema.prisma         # Contact model with indexes
tests/
  identify.test.ts      # 16 integration tests across 5 suites
  globalSetup.ts        # Initialises test database before suite runs
  setup.ts              # Sets DATABASE_URL for test worker
```

---

## Database Schema

```prisma
model Contact {
  id             Int       @id @default(autoincrement())
  phoneNumber    String?
  email          String?
  linkedId       Int?      // FK → primary contact's id
  linkPrecedence String    // "primary" | "secondary"
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt
  deletedAt      DateTime? // soft delete

  @@index([email])
  @@index([phoneNumber])
  @@index([linkedId])
}
```

---

## Local Setup

```bash
# 1. Clone and install
git clone <repo-url> && cd bitespeed-backend
npm install

# 2. Configure environment
cp .env.example .env

# 3. Initialise database
npx prisma db push

# 4. Start dev server
npm run dev
# → http://localhost:3000

# 5. Run tests
npm test
```

**Scripts**

| Command | Description |
|---------|-------------|
| `npm run dev` | Dev server with hot reload |
| `npm run build` | Compile TypeScript + sync schema |
| `npm start` | Run compiled production build |
| `npm test` | Run full integration test suite |
| `npm run db:push` | Push schema changes to database |

---

## Design Decisions

**Oldest-wins strategy**
When merging two primary clusters, the contact created first is always kept as primary. This is deterministic and matches the spec — no ambiguity.

**Soft deletes**
`deletedAt` is retained on all records. No data is permanently lost, allows for potential recovery.

**Input trimming**
Email and phone are `.trim()`'d before any lookup or storage, preventing ghost duplicates from whitespace differences.

**Database indexes**
`email`, `phoneNumber`, and `linkedId` are indexed. The most common query patterns (lookup by email/phone, fetch cluster by linkedId) stay fast as the table grows.

**Number-to-string coercion**
`phoneNumber` accepts both `string` and `number` per the task spec. It is always coerced to `string` before storage.

**LibSQL adapter**
Prisma's LibSQL adapter makes it trivial to swap SQLite for [Turso](https://turso.tech) (distributed SQLite) for production scale without any code changes.
