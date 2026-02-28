import "dotenv/config";
import express from "express";
import cors from "cors";
import morgan from "morgan";
import identifyRouter from "./routes/identify";
import prisma from "./db";

const app = express();
const PORT = process.env["PORT"] ?? 3000;

app.use(cors());
app.use(morgan("dev"));
app.use(express.json());

app.get("/", (_req, res) => {
  res.json({
    service: "Bitespeed Identity Reconciliation",
    status: "healthy",
    endpoint: "POST /identify",
    payload: { email: "string (optional)", phoneNumber: "string (optional)" },
  });
});

app.use("/identify", identifyRouter);

app.get("/contacts", async (_req, res) => {
  try {
    const contacts = await prisma.contact.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: "asc" },
    });
    res.json({ total: contacts.length, contacts });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

export default app;
