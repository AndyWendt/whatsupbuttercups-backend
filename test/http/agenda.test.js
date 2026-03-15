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
      },
    ],
  ]);
  const householdMembers = new Map([
    ["house-1:user-uid-owner", { household_id: "house-1", user_id: "user-uid-owner", role: "admin" }],
  ]);
  const items = [
    {
      id: "item-personal",
      title: "Read",
      recurrence: "daily",
      is_active: 1,
      household_id: null,
      owner_user_id: "user-uid-owner",
      created_at: "2026-03-01T00:00:00.000Z",
      updated_at: "2026-03-01T00:00:00.000Z",
    },
    {
      id: "item-hous",
      title: "Pack",
      recurrence: "weekly",
      is_active: 1,
      household_id: "house-1",
      owner_user_id: "user-uid-owner",
      created_at: "2026-03-02T00:00:00.000Z",
      updated_at: "2026-03-02T00:00:00.000Z",
    },
    {
      id: "item-inactive",
      title: "Ignore",
      recurrence: "daily",
      is_active: 0,
      household_id: null,
      owner_user_id: "user-uid-owner",
      created_at: "2026-03-01T00:00:00.000Z",
      updated_at: "2026-03-01T00:00:00.000Z",
    },
  ];

  return {
    users,
    verifyFirebaseToken: async (token) => {
      if (token === "owner-token") {
        return { uid: "uid-owner", email: "owner@example.com" };
      }
      throw new Error("invalid token");
    },
    getProfileByFirebaseUid: async (firebaseUid) => users.get(firebaseUid) || null,
    getHouseholdMembership: async (householdId, userId) =>
      householdMembers.get(`${householdId}:${userId}`) || null,
    listItemsForUser: async () => items,
    listVisibleItemsForDate: async () => items,
  };
};

describe("GET /agenda", () => {
  it("returns active personal and household items for a date", async () => {
    const env = makeEnv();
    const response = await worker.fetch(
      new Request("https://example.test/agenda?date=2026-03-09", {
        headers: {
          Authorization: "Bearer owner-token",
        },
      }),
      env,
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.date).toBe("2026-03-09");
    expect(body.items).toHaveLength(2);
    const ids = body.items.map((item) => item.id).sort();
    expect(ids).toContain("item-personal");
    expect(ids).toContain("item-hous");
  });

  it("requires date query", async () => {
    const env = makeEnv();
    const response = await worker.fetch(
      new Request("https://example.test/agenda", {
        headers: {
          Authorization: "Bearer owner-token",
        },
      }),
      env,
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("bad_request");
  });
});
