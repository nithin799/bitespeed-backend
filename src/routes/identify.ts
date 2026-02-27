import { Router, Request, Response } from "express";
import prisma from "../db";
import type { Contact } from "../generated/prisma/client";

const router = Router();

router.post("/", async (req: Request, res: Response) => {
  const { email, phoneNumber: rawPhone } = req.body as {
    email?: string | null;
    phoneNumber?: string | number | null;
  };

  // Convert phoneNumber to string if sent as a number (spec allows number type)
  const phoneNumber =
    rawPhone !== undefined && rawPhone !== null ? String(rawPhone) : rawPhone;

  if (!email && !phoneNumber) {
    res.status(400).json({ error: "email or phoneNumber is required" });
    return;
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (email !== undefined && email !== null) {
    if (typeof email !== "string" || email.trim() === "" || !emailRegex.test(email)) {
      res.status(400).json({ error: "invalid email format" });
      return;
    }
  }

  try {
    const normalizedPhone = phoneNumber ? String(phoneNumber) : null;

    // Build OR conditions for the initial lookup
    const orConditions: any[] = [];
    if (email) orConditions.push({ email });
    if (normalizedPhone)
      orConditions.push({
        phoneNumber: normalizedPhone,
      });

    // Step 1: Find all contacts that match the incoming email or phoneNumber
    const matchingContacts = await prisma.contact.findMany({
      where: {
        deletedAt: null,
        OR: orConditions,
      },
    });

    // Step 2: No existing contacts — create a new primary contact
    if (matchingContacts.length === 0) {
      const newContact = await prisma.contact.create({
        data: {
          email: email ?? null,
          phoneNumber: normalizedPhone,
          linkedId: null,
          linkPrecedence: "primary",
        },
      });

      res.status(200).json({
        contact: {
          primaryContatctId: newContact.id,
          emails: newContact.email ? [newContact.email] : [],
          phoneNumbers: newContact.phoneNumber ? [newContact.phoneNumber] : [],
          secondaryContactIds: [],
        },
      });
      return;
    }

    // Step 3: Collect all primary IDs referenced by the matching contacts
    const primaryIds = new Set<number>();
    for (const contact of matchingContacts) {
      if (contact.linkPrecedence === "primary") {
        primaryIds.add(contact.id);
      } else if (contact.linkedId !== null) {
        primaryIds.add(contact.linkedId);
      }
    }

    // Step 4: Load all contacts across all involved clusters
    const allClusterContacts = await prisma.contact.findMany({
      where: {
        deletedAt: null,
        OR: [
          { id: { in: [...primaryIds] } },
          { linkedId: { in: [...primaryIds] } },
        ],
      },
      orderBy: { createdAt: "asc" },
    });

    // Step 5: Determine THE primary — the oldest among the primaries
    const primaries = allClusterContacts
      .filter((c) => c.linkPrecedence === "primary")
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

    const thePrimary = primaries[0]!;
    const otherPrimaries = primaries.slice(1);

    // Step 6: Demote any extra primaries to secondary and re-link their children
    if (otherPrimaries.length > 0) {
      const demotedIds = otherPrimaries.map((c) => c.id);

      await prisma.contact.updateMany({
        where: { id: { in: demotedIds } },
        data: { linkedId: thePrimary.id, linkPrecedence: "secondary" },
      });

      // Re-parent any secondaries that were pointing to a now-demoted primary
      await prisma.contact.updateMany({
        where: { linkedId: { in: demotedIds }, deletedAt: null },
        data: { linkedId: thePrimary.id },
      });
    }

    // Step 7: Reload the now-merged cluster
    const mergedCluster = await prisma.contact.findMany({
      where: {
        deletedAt: null,
        OR: [{ id: thePrimary.id }, { linkedId: thePrimary.id }],
      },
      orderBy: { createdAt: "asc" },
    });

    // Step 8: Check if the request introduces new info not present in the cluster
    const existingEmails = new Set(
      mergedCluster.map((c) => c.email).filter(Boolean)
    );
    const existingPhones = new Set(
      mergedCluster.map((c) => c.phoneNumber).filter(Boolean)
    );

    const isNewEmail = email !== null && email !== undefined && !existingEmails.has(email);
    const isNewPhone =
      normalizedPhone !== null && !existingPhones.has(normalizedPhone);

    if (isNewEmail || isNewPhone) {
      await prisma.contact.create({
        data: {
          email: email ?? null,
          phoneNumber: normalizedPhone,
          linkedId: thePrimary.id,
          linkPrecedence: "secondary",
        },
      });

      // Reload cluster after the new secondary is inserted
      const updatedCluster = await prisma.contact.findMany({
        where: {
          deletedAt: null,
          OR: [{ id: thePrimary.id }, { linkedId: thePrimary.id }],
        },
        orderBy: { createdAt: "asc" },
      });

      res.status(200).json(buildResponse(thePrimary.id, updatedCluster));
      return;
    }

    res.status(200).json(buildResponse(thePrimary.id, mergedCluster));
  } catch (error) {
    console.error("Error in /identify:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

function buildResponse(primaryId: number, contacts: Contact[]) {
  const primary = contacts.find((c) => c.id === primaryId)!;
  const secondaries = contacts.filter((c) => c.id !== primaryId);

  const emails: string[] = [];
  const phoneNumbers: string[] = [];
  const secondaryContactIds: number[] = [];

  if (primary.email) emails.push(primary.email);
  if (primary.phoneNumber) phoneNumbers.push(primary.phoneNumber);

  for (const s of secondaries) {
    secondaryContactIds.push(s.id);
    if (s.email && !emails.includes(s.email)) emails.push(s.email);
    if (s.phoneNumber && !phoneNumbers.includes(s.phoneNumber))
      phoneNumbers.push(s.phoneNumber);
  }

  return {
    contact: {
      primaryContatctId: primaryId,
      emails,
      phoneNumbers,
      secondaryContactIds,
    },
  };
}

export default router;
