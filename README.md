# Bitespeed Backend Task: Identity Reconciliation

A web service that identifies and consolidates customer contact information across multiple purchases. Built as part of the Bitespeed Backend Engineering assignment.

## Live Endpoint

> **`<YOUR_HOSTED_URL>/identify`**

_(Replace with actual hosted URL after deployment)_

## Tech Stack

- **Runtime:** Node.js with TypeScript
- **Framework:** Express.js
- **ORM:** Prisma (v7)
- **Database:** SQLite (via LibSQL adapter)

## API Specification

### `POST /identify`

Accepts a JSON body with at least one of `email` or `phoneNumber`:

```json
{
  "email": "example@domain.com",
  "phoneNumber": "1234567890"
}
```

**Response (200 OK):**

```json
{
  "contact": {
    "primaryContatctId": 1,
    "emails": ["primary@example.com", "secondary@example.com"],
    "phoneNumbers": ["1234567890"],
    "secondaryContactIds": [2, 3]
  }
}
```

### How It Works

1. **New customer:** If no existing contact matches, a new primary contact is created.
2. **Existing customer, new info:** If the email or phone matches an existing contact but contains new information, a secondary contact is created and linked to the primary.
3. **Merging contacts:** If the request links two previously separate primary contacts, the older one remains primary and the newer one is demoted to secondary.

## Setup & Run Locally

### Prerequisites

- Node.js (v18 or higher)
- npm

### Installation

```bash
git clone <repo-url>
cd bitespeed-backend
npm install
```

### Configure Environment

Create a `.env` file in the root:

```
DATABASE_URL="file:./dev.db"
```

### Initialize Database

```bash
npx prisma db push
```

### Run Development Server

```bash
npm run dev
```

Server starts at `http://localhost:3000`.

### Build & Run Production

```bash
npm run build
npm start
```

## Project Structure

```
src/
  index.ts              # Express server entry point
  db.ts                 # Prisma client configuration
  routes/
    identify.ts         # /identify endpoint logic
prisma/
  schema.prisma         # Database schema
```

## Database Schema

```
Contact {
  id              Int       @id @default(autoincrement())
  phoneNumber     String?
  email           String?
  linkedId        Int?
  linkPrecedence  String    // "primary" | "secondary"
  createdAt       DateTime
  updatedAt       DateTime
  deletedAt       DateTime?
}
```
