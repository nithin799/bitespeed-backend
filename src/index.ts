import "dotenv/config";
import express from "express";
import cors from "cors";
import identifyRouter from "./routes/identify";

const app = express();
const PORT = process.env["PORT"] ?? 3000;

app.use(cors());
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

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

export default app;
