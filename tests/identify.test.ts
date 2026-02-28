import request from "supertest";
import app from "../src/index";
import prisma from "../src/db";

// Clean database between tests to ensure isolation
beforeEach(async () => {
  await prisma.contact.deleteMany();
});

afterAll(async () => {
  await prisma.contact.deleteMany();
  await prisma.$disconnect();
});

// ─── Input Validation ────────────────────────────────────────────────────────

describe("Input Validation", () => {
  it("returns 400 when both email and phoneNumber are missing", async () => {
    const res = await request(app).post("/identify").send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("email or phoneNumber is required");
  });

  it("returns 400 for invalid email format", async () => {
    const res = await request(app)
      .post("/identify")
      .send({ email: "not-an-email" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("invalid email format");
  });

  it("returns 400 for empty string email", async () => {
    const res = await request(app)
      .post("/identify")
      .send({ email: "   " });
    expect(res.status).toBe(400);
  });

  it("accepts phoneNumber as a number type (spec requirement)", async () => {
    const res = await request(app)
      .post("/identify")
      .send({ phoneNumber: 123456 });
    expect(res.status).toBe(200);
    expect(res.body.contact.phoneNumbers).toContain("123456");
  });

  it("trims whitespace from email before processing", async () => {
    // Two requests with same email, one with padding — should link to same contact
    await request(app)
      .post("/identify")
      .send({ email: "lorraine@hillvalley.edu", phoneNumber: "111" });

    const res = await request(app)
      .post("/identify")
      .send({ email: "  lorraine@hillvalley.edu  ", phoneNumber: "222" });

    expect(res.status).toBe(200);
    expect(res.body.contact.emails).toContain("lorraine@hillvalley.edu");
    expect(res.body.contact.phoneNumbers).toContain("111");
    expect(res.body.contact.phoneNumbers).toContain("222");
  });
});

// ─── New Customer ─────────────────────────────────────────────────────────────

describe("New Customer", () => {
  it("creates a new primary contact when no match exists", async () => {
    const res = await request(app).post("/identify").send({
      email: "lorraine@hillvalley.edu",
      phoneNumber: "123456",
    });

    expect(res.status).toBe(200);
    expect(res.body.contact.emails).toEqual(["lorraine@hillvalley.edu"]);
    expect(res.body.contact.phoneNumbers).toEqual(["123456"]);
    expect(res.body.contact.secondaryContactIds).toEqual([]);
    expect(res.body.contact.primaryContatctId).toBeDefined();
  });

  it("creates a primary contact with only email", async () => {
    const res = await request(app)
      .post("/identify")
      .send({ email: "onlyemail@test.com" });

    expect(res.status).toBe(200);
    expect(res.body.contact.emails).toContain("onlyemail@test.com");
    expect(res.body.contact.phoneNumbers).toEqual([]);
    expect(res.body.contact.secondaryContactIds).toEqual([]);
  });

  it("creates a primary contact with only phone", async () => {
    const res = await request(app)
      .post("/identify")
      .send({ phoneNumber: "9999999999" });

    expect(res.status).toBe(200);
    expect(res.body.contact.emails).toEqual([]);
    expect(res.body.contact.phoneNumbers).toContain("9999999999");
    expect(res.body.contact.secondaryContactIds).toEqual([]);
  });
});

// ─── Existing Customer (Secondary Creation) ──────────────────────────────────

describe("Existing Customer — Secondary Contact Creation", () => {
  it("links new email to existing primary via matching phone", async () => {
    // First visit
    const first = await request(app).post("/identify").send({
      email: "lorraine@hillvalley.edu",
      phoneNumber: "123456",
    });
    const primaryId = first.body.contact.primaryContatctId;

    // Second visit — same phone, new email
    const res = await request(app).post("/identify").send({
      email: "mcfly@hillvalley.edu",
      phoneNumber: "123456",
    });

    expect(res.status).toBe(200);
    expect(res.body.contact.primaryContatctId).toBe(primaryId);
    expect(res.body.contact.emails).toContain("lorraine@hillvalley.edu");
    expect(res.body.contact.emails).toContain("mcfly@hillvalley.edu");
    expect(res.body.contact.phoneNumbers).toEqual(["123456"]);
    expect(res.body.contact.secondaryContactIds).toHaveLength(1);
  });

  it("links new phone to existing primary via matching email", async () => {
    await request(app).post("/identify").send({
      email: "george@hillvalley.edu",
      phoneNumber: "111111",
    });

    const res = await request(app).post("/identify").send({
      email: "george@hillvalley.edu",
      phoneNumber: "999999",
    });

    expect(res.status).toBe(200);
    expect(res.body.contact.phoneNumbers).toContain("111111");
    expect(res.body.contact.phoneNumbers).toContain("999999");
    expect(res.body.contact.secondaryContactIds).toHaveLength(1);
  });

  it("does NOT create duplicate secondary for existing email+phone combo", async () => {
    await request(app).post("/identify").send({
      email: "lorraine@hillvalley.edu",
      phoneNumber: "123456",
    });

    // Exact same request again
    const res = await request(app).post("/identify").send({
      email: "lorraine@hillvalley.edu",
      phoneNumber: "123456",
    });

    expect(res.status).toBe(200);
    expect(res.body.contact.secondaryContactIds).toHaveLength(0);
  });
});

// ─── Primary → Secondary (Cluster Merging) ───────────────────────────────────

describe("Primary Contact Turns Into Secondary (Cluster Merging)", () => {
  it("demotes the newer primary when two clusters are linked", async () => {
    // Create two separate primary contacts
    const georgeRes = await request(app).post("/identify").send({
      email: "george@hillvalley.edu",
      phoneNumber: "919191",
    });
    const biffRes = await request(app).post("/identify").send({
      email: "biffsucks@hillvalley.edu",
      phoneNumber: "717171",
    });

    const georgeId = georgeRes.body.contact.primaryContatctId;
    const biffId = biffRes.body.contact.primaryContatctId;

    // Bridge them — george's email + biff's phone
    const res = await request(app).post("/identify").send({
      email: "george@hillvalley.edu",
      phoneNumber: "717171",
    });

    expect(res.status).toBe(200);
    // Older primary (george) stays primary
    expect(res.body.contact.primaryContatctId).toBe(georgeId);
    // Newer primary (biff) becomes secondary
    expect(res.body.contact.secondaryContactIds).toContain(biffId);
    // All data consolidated
    expect(res.body.contact.emails).toContain("george@hillvalley.edu");
    expect(res.body.contact.emails).toContain("biffsucks@hillvalley.edu");
    expect(res.body.contact.phoneNumbers).toContain("919191");
    expect(res.body.contact.phoneNumbers).toContain("717171");
  });

  it("primary email appears first in emails array", async () => {
    await request(app).post("/identify").send({
      email: "primary@test.com",
      phoneNumber: "111",
    });
    await request(app).post("/identify").send({
      email: "secondary@test.com",
      phoneNumber: "222",
    });

    const res = await request(app).post("/identify").send({
      email: "primary@test.com",
      phoneNumber: "222",
    });

    expect(res.body.contact.emails[0]).toBe("primary@test.com");
  });

  it("re-parents orphaned secondaries when their primary is demoted", async () => {
    // Build: clusterA = primary A + secondary A2
    await request(app)
      .post("/identify")
      .send({ email: "a@test.com", phoneNumber: "111" });
    await request(app)
      .post("/identify")
      .send({ email: "a2@test.com", phoneNumber: "111" });

    // clusterB = primary B (separate)
    await request(app)
      .post("/identify")
      .send({ email: "b@test.com", phoneNumber: "999" });

    // Bridge clusters — A's phone + B's email
    const res = await request(app)
      .post("/identify")
      .send({ email: "b@test.com", phoneNumber: "111" });

    expect(res.status).toBe(200);
    expect(res.body.contact.emails).toContain("a@test.com");
    expect(res.body.contact.emails).toContain("a2@test.com");
    expect(res.body.contact.emails).toContain("b@test.com");
  });
});

// ─── Response Shape ───────────────────────────────────────────────────────────

describe("Response Shape", () => {
  it("response always has the correct keys", async () => {
    const res = await request(app)
      .post("/identify")
      .send({ email: "shape@test.com" });

    expect(res.body).toHaveProperty("contact");
    expect(res.body.contact).toHaveProperty("primaryContatctId");
    expect(res.body.contact).toHaveProperty("emails");
    expect(res.body.contact).toHaveProperty("phoneNumbers");
    expect(res.body.contact).toHaveProperty("secondaryContactIds");
    expect(Array.isArray(res.body.contact.emails)).toBe(true);
    expect(Array.isArray(res.body.contact.phoneNumbers)).toBe(true);
    expect(Array.isArray(res.body.contact.secondaryContactIds)).toBe(true);
  });

  it("no duplicate emails or phone numbers in response", async () => {
    await request(app).post("/identify").send({
      email: "dup@test.com",
      phoneNumber: "123",
    });
    await request(app).post("/identify").send({
      email: "dup2@test.com",
      phoneNumber: "123",
    });

    const res = await request(app).post("/identify").send({
      email: "dup@test.com",
      phoneNumber: "123",
    });

    const emails = res.body.contact.emails;
    const phones = res.body.contact.phoneNumbers;
    expect(emails.length).toBe(new Set(emails).size);
    expect(phones.length).toBe(new Set(phones).size);
  });
});
