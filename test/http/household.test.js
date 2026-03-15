import { describe, expect, it } from "vitest";
import worker from "../../src/worker/index.js";

const makeEnv = () => {
  const users = new Map([
    [
      "uid-owner",
      {
        id: "user-uid-owner",
        firebase_uid: "uid-owner",
        email: "owner@example.com",
        display_name: "Owner User",
        created_at: "2026-01-01T00:00:00.000Z",
      },
    ],
  ]);
  const households = new Map();
  const householdMembers = new Map();

  return {
    users,
    households,
    householdMembers,
    verifyFirebaseToken: async (token) => {
      if (token === "owner-token") {
        return { uid: "uid-owner", email: "owner@example.com", name: "Owner User" };
      }
      throw new Error("invalid token");
    },
    getProfileByFirebaseUid: async (firebaseUid) => users.get(firebaseUid) || null,
    createHousehold: async ({ id, name, creatorUserId, createdAt, updatedAt }) => {
      const household = {
        id,
        name,
        creator_user_id: creatorUserId,
        created_at: createdAt,
        updated_at: updatedAt,
      };
      households.set(id, household);
      return household;
    },
    addHouseholdMember: async ({ householdId, userId, role }) => {
      const member = {
        household_id: householdId,
        user_id: userId,
        role,
      };
      householdMembers.set(`${householdId}:${userId}`, member);
      return member;
    },
  };
};

describe("POST /household", () => {
  it("creates household and assigns creator as admin", async () => {
    const env = makeEnv();
    const request = new Request("https://example.test/household", {
      method: "POST",
      headers: {
        Authorization: "Bearer owner-token",
        "content-type": "application/json",
      },
      body: JSON.stringify({ name: "My Place" }),
    });

    const response = await worker.fetch(request, env);
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.household).toMatchObject({
      name: "My Place",
      creator_user_id: "user-uid-owner",
    });
    expect(body.member).toMatchObject({
      role: "admin",
      user_id: "user-uid-owner",
    });
  });

  it("requires a name", async () => {
    const env = makeEnv();
    const request = new Request("https://example.test/household", {
      method: "POST",
      headers: {
        Authorization: "Bearer owner-token",
        "content-type": "application/json",
      },
      body: JSON.stringify({}),
    });

    const response = await worker.fetch(request, env);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("bad_request");
  });

  it("requires authorization", async () => {
    const env = makeEnv();
    const request = new Request("https://example.test/household", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ name: "My Place" }),
    });

    const response = await worker.fetch(request, env);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe("unauthorized");
  });
});
