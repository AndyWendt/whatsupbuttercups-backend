import { describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { runMigrations } from "../../src/data/migrations.js";
import worker from "../../src/worker/index.js";

const makeEnv = () => {
  const db = new DatabaseSync(":memory:");
  runMigrations(db);
  const env = {
    DB: db,
    verifyFirebaseToken: async (token) => {
      if (token === "owner-token") {
        return {
          uid: "uid-owner",
          email: "owner@example.com",
          name: "Owner User",
        };
      }
      throw new Error("invalid token");
    },
  };

  return env;
};

describe("db-backed worker", () => {
  it("creates and reads records with only env.DB binding", async () => {
    const env = makeEnv();
    const verifyResponse = await worker.fetch(
      new Request("https://example.test/session/verify", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ token: "owner-token" }),
      }),
      env,
    );
    const verifyBody = await verifyResponse.json();

    expect(verifyResponse.status).toBe(200);
    expect(verifyBody.user.firebase_uid).toBe("uid-owner");

    const householdResponse = await worker.fetch(
      new Request("https://example.test/household", {
        method: "POST",
        headers: {
          Authorization: "Bearer owner-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({ name: "Family" }),
      }),
      env,
    );
    const householdBody = await householdResponse.json();

    expect(householdResponse.status).toBe(201);
    expect(householdBody.household.name).toBe("Family");

    const itemResponse = await worker.fetch(
      new Request("https://example.test/items", {
        method: "POST",
        headers: {
          Authorization: "Bearer owner-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          title: "Read",
          recurrence: "daily",
        }),
      }),
      env,
    );
    const itemBody = await itemResponse.json();

    expect(itemResponse.status).toBe(201);
    expect(itemBody.item.owner_user_id).toBe(householdBody.member.user_id);
  });
});

