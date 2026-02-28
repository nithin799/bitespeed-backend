// Set test database BEFORE any modules (including db.ts) are imported
process.env["DATABASE_URL"] = "file:./prisma/test.db";
