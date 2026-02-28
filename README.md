# Bitespeed Backend Task: Identity Reconciliation

![Node.js](https://img.shields.io/badge/Node.js-v18+-339933?logo=node.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)
![Express](https://img.shields.io/badge/Express-5.x-000000?logo=express&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma-7.4-2D3748?logo=prisma&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-Database-003B57?logo=sqlite&logoColor=white)

A web service that identifies and consolidates customer contact information across multiple purchases. Built for the **Bitespeed Backend Engineering Task**.

---

## Live Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| **`https://bitespeed-backend-xpj2.onrender.com/identify`** | `POST` | Identity reconciliation |
| **`https://bitespeed-backend-xpj2.onrender.com/contacts`** | `GET` | View all stored contacts |
| **`https://bitespeed-backend-xpj2.onrender.com/`** | `GET` | Health check |

---

## How It Works

```
Customer makes a purchase         POST /identify
with email & phone        --->    { email, phoneNumber }
                                         |
                                         v
                              +---------------------+
                              |  Match in database?  |
                              +---------------------+
                               /         |          \
                              v          v           v
                          No match   Partial match   Bridges two
                              |          |           separate contacts
                              v          v           v
                        Create new   Create new     Merge clusters:
                        PRIMARY      SECONDARY      older = primary
                        contact      linked to      newer = secondary
                                     primary
```

---

## API Specification

### `POST /identify`

**Request Body** (JSON):

| Field | Type | Required |
|-------|------|----------|
| `email` | `string` | At least one required |
| `phoneNumber` | `string \| number` | At least one required |

**Response** (200 OK):

```json
{
  "contact": {
    "primaryContatctId": 1,
    "emails": ["primary@example.com", "secondary@example.com"],
    "phoneNumbers": ["1234567890"],
    "secondaryContactIds": [23]
  }
}
```

---

## Example Scenarios

### 1. New Customer

```bash
# Request
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

### 2. Existing Customer, New Email

Same phone `123456`, but different email `mcfly@hillvalley.edu`:

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

> A secondary contact is created and linked to the primary.

### 3. Primary Turns Into Secondary

Two separate contacts exist:
- George: `george@hillvalley.edu` / `919191` (primary, id: 11)
- Biff: `biffsucks@hillvalley.edu` / `717171` (primary, id: 27)

A request bridges them:

```bash
curl -X POST https://bitespeed-backend-xpj2.onrender.com/identify \
  -H "Content-Type: application/json" \
  -d '{"email": "george@hillvalley.edu", "phoneNumber": "717171"}'
```

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

> The older contact (id: 11) stays **primary**. The newer one (id: 27) is **demoted to secondary**.

---

## Tech Stack

| Technology | Purpose |
|------------|---------|
| **Node.js** | Runtime environment |
| **TypeScript** | Type-safe development |
| **Express v5** | HTTP framework |
| **Prisma v7** | ORM & database toolkit |
| **SQLite (LibSQL)** | Lightweight relational database |
| **CORS** | Cross-origin request support |
| **dotenv** | Environment configuration |

---

## Project Structure

```
bitespeed-backend/
  src/
    index.ts              # Express server + health check
    db.ts                 # Prisma client with LibSQL adapter
    routes/
      identify.ts         # POST /identify - core reconciliation logic
  prisma/
    schema.prisma         # Contact model definition
  .env.example            # Environment variable template
  tsconfig.json           # TypeScript configuration
  package.json            # Dependencies & scripts
```

---

## Database Schema

```sql
Contact {
  id              Int       @id @default(autoincrement())
  phoneNumber     String?
  email           String?
  linkedId        Int?      -- references another Contact's id
  linkPrecedence  String    -- "primary" | "secondary"
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
  deletedAt       DateTime? -- soft delete support
}
```

---

## Setup & Run Locally

### Prerequisites

- Node.js v18 or higher
- npm

### Quick Start

```bash
# Clone the repository
git clone <repo-url>
cd bitespeed-backend

# Install dependencies (auto-generates Prisma client)
npm install

# Set up environment
cp .env.example .env

# Initialize database
npx prisma db push

# Start development server
npm run dev
```

Server runs at **http://localhost:3000**

### Production Build

```bash
npm run build
npm start
```

### Available Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start dev server with hot reload |
| `npm run build` | Compile TypeScript + generate Prisma |
| `npm start` | Run production build |
| `npm run db:push` | Push schema to database |
| `npm run db:generate` | Regenerate Prisma client |

---

## Error Handling

| Status | Condition | Response |
|--------|-----------|----------|
| `400` | Missing email and phone | `{"error": "email or phoneNumber is required"}` |
| `400` | Invalid email format | `{"error": "invalid email format"}` |
| `500` | Database/server error | `{"error": "Internal server error"}` |

---

## Design Decisions

- **SQLite with LibSQL adapter** - Lightweight, zero-config database ideal for this service. LibSQL adapter makes it compatible with Turso for cloud deployment.
- **Soft deletes** - `deletedAt` field allows contact recovery without permanent data loss.
- **Oldest-wins strategy** - When merging two primary contacts, the one created first is preserved as primary, ensuring deterministic behavior.
- **Number-to-string coercion** - `phoneNumber` accepts both `string` and `number` types per the task specification, automatically converting to string for storage.
