import type { OAS3Definition } from "swagger-jsdoc";

const swaggerSpec: OAS3Definition = {
  openapi: "3.0.0",
  info: {
    title: "Bitespeed Identity Reconciliation API",
    version: "1.0.0",
    description:
      "Identifies and consolidates customer contact information across multiple purchases. " +
      "Links contacts that share an email or phone number into a single primary/secondary hierarchy.",
    contact: {
      name: "Source Code",
      url: "https://github.com/nithin799/bitespeed-backend",
    },
  },
  servers: [
    {
      url: "https://bitespeed-backend-xpj2.onrender.com",
      description: "Live (Render)",
    },
    {
      url: "http://localhost:3000",
      description: "Local development",
    },
  ],
  tags: [
    {
      name: "Identity",
      description: "Contact reconciliation",
    },
    {
      name: "Utility",
      description: "Health check and debug endpoints",
    },
  ],
  paths: {
    "/identify": {
      post: {
        tags: ["Identity"],
        summary: "Reconcile a customer identity",
        description:
          "Takes an email and/or phone number and returns a consolidated contact cluster. " +
          "Creates a new primary contact if no match is found. Links contacts that share " +
          "identifiers, demoting the newer primary to secondary when two clusters merge.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/IdentifyRequest",
              },
              examples: {
                new_customer: {
                  summary: "New customer",
                  value: {
                    email: "lorraine@hillvalley.edu",
                    phoneNumber: "123456",
                  },
                },
                returning_new_email: {
                  summary: "Returning customer with new email",
                  value: {
                    email: "mcfly@hillvalley.edu",
                    phoneNumber: "123456",
                  },
                },
                merge_clusters: {
                  summary: "Bridge two separate contacts",
                  value: {
                    email: "george@hillvalley.edu",
                    phoneNumber: "717171",
                  },
                },
                phone_only: {
                  summary: "Phone number only",
                  value: {
                    phoneNumber: "9999999999",
                  },
                },
                email_only: {
                  summary: "Email only",
                  value: {
                    email: "onlyemail@example.com",
                  },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Consolidated contact cluster",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/IdentifyResponse",
                },
                examples: {
                  single_primary: {
                    summary: "New or single contact",
                    value: {
                      contact: {
                        primaryContatctId: 1,
                        emails: ["lorraine@hillvalley.edu"],
                        phoneNumbers: ["123456"],
                        secondaryContactIds: [],
                      },
                    },
                  },
                  with_secondary: {
                    summary: "Primary with a linked secondary",
                    value: {
                      contact: {
                        primaryContatctId: 1,
                        emails: [
                          "lorraine@hillvalley.edu",
                          "mcfly@hillvalley.edu",
                        ],
                        phoneNumbers: ["123456"],
                        secondaryContactIds: [2],
                      },
                    },
                  },
                  merged_clusters: {
                    summary: "Two clusters merged",
                    value: {
                      contact: {
                        primaryContatctId: 11,
                        emails: [
                          "george@hillvalley.edu",
                          "biffsucks@hillvalley.edu",
                        ],
                        phoneNumbers: ["919191", "717171"],
                        secondaryContactIds: [27],
                      },
                    },
                  },
                },
              },
            },
          },
          "400": {
            description: "Validation error",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
                examples: {
                  missing_fields: {
                    summary: "Neither email nor phone provided",
                    value: { error: "email or phoneNumber is required" },
                  },
                  invalid_email: {
                    summary: "Malformed email address",
                    value: { error: "invalid email format" },
                  },
                },
              },
            },
          },
          "500": {
            description: "Internal server error",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
                example: { error: "Internal server error" },
              },
            },
          },
        },
      },
    },
    "/contacts": {
      get: {
        tags: ["Utility"],
        summary: "List all contacts",
        description:
          "Returns every non-deleted contact record ordered by creation date. " +
          "Useful for inspecting the current state of the database.",
        responses: {
          "200": {
            description: "All stored contacts",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    total: {
                      type: "integer",
                      example: 3,
                    },
                    contacts: {
                      type: "array",
                      items: { $ref: "#/components/schemas/Contact" },
                    },
                  },
                },
              },
            },
          },
          "500": {
            description: "Internal server error",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
        },
      },
    },
    "/": {
      get: {
        tags: ["Utility"],
        summary: "Health check",
        description: "Returns service status and available endpoints.",
        responses: {
          "200": {
            description: "Service is healthy",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    service: { type: "string", example: "Bitespeed Identity Reconciliation" },
                    status: { type: "string", example: "healthy" },
                    endpoint: { type: "string", example: "POST /identify" },
                    payload: {
                      type: "object",
                      properties: {
                        email: { type: "string", example: "string (optional)" },
                        phoneNumber: { type: "string", example: "string (optional)" },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
  components: {
    schemas: {
      IdentifyRequest: {
        type: "object",
        description: "At least one of email or phoneNumber must be provided.",
        properties: {
          email: {
            type: "string",
            format: "email",
            nullable: true,
            example: "lorraine@hillvalley.edu",
          },
          phoneNumber: {
            oneOf: [{ type: "string" }, { type: "integer" }],
            nullable: true,
            description: "Accepts both string and number.",
            example: "123456",
          },
        },
      },
      IdentifyResponse: {
        type: "object",
        properties: {
          contact: {
            type: "object",
            properties: {
              primaryContatctId: {
                type: "integer",
                description: "ID of the oldest (primary) contact in the cluster.",
                example: 1,
              },
              emails: {
                type: "array",
                items: { type: "string" },
                description: "All unique emails in the cluster. Primary email is first.",
                example: ["lorraine@hillvalley.edu", "mcfly@hillvalley.edu"],
              },
              phoneNumbers: {
                type: "array",
                items: { type: "string" },
                description: "All unique phone numbers in the cluster. Primary phone is first.",
                example: ["123456"],
              },
              secondaryContactIds: {
                type: "array",
                items: { type: "integer" },
                description: "IDs of all secondary contacts linked to the primary.",
                example: [23],
              },
            },
          },
        },
      },
      Contact: {
        type: "object",
        properties: {
          id: { type: "integer", example: 1 },
          email: { type: "string", nullable: true, example: "lorraine@hillvalley.edu" },
          phoneNumber: { type: "string", nullable: true, example: "123456" },
          linkedId: {
            type: "integer",
            nullable: true,
            description: "ID of the primary contact this record is linked to.",
            example: null,
          },
          linkPrecedence: {
            type: "string",
            enum: ["primary", "secondary"],
            example: "primary",
          },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
          deletedAt: { type: "string", format: "date-time", nullable: true },
        },
      },
      ErrorResponse: {
        type: "object",
        properties: {
          error: { type: "string", example: "email or phoneNumber is required" },
        },
      },
    },
  },
};

export default swaggerSpec;
