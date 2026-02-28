import { execSync } from "child_process";

export default async function globalSetup() {
  // Push schema to test database before any tests run
  execSync("npx prisma db push --url file:./prisma/test.db", {
    stdio: "inherit",
  });
}
