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

  const items = [
    {
      id: "item-daily",
      title: "Read",
      recurrence: "daily",
      is_active: 1,
      household_id: null,
      owner_user_id: "user-uid-owner",
      created_at: "2026-03-02T00:00:00.000Z",
      updated_at: "2026-03-02T00:00:00.000Z",
    },
    {
      id: "item-weekly",
      title: "Pack",
      recurrence: "weekly",
      is_active: 1,
      household_id: null,
      owner_user_id: "user-uid-owner",
      created_at: "2026-03-01T00:00:00.000Z",
      updated_at: "2026-03-01T00:00:00.000Z",
    },
  ];

  const completions = [
    { item_id: "item-daily", occurred_on: "2026-03-03" },
    { item_id: "item-daily", occurred_on: "2026-03-04" },
    { item_id: "item-daily", occurred_on: "2026-03-05" },
    { item_id: "item-weekly", occurred_on: "2026-03-08" },
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
    listItemsForUser: async () => items,
    listCompletionsForUserInRange: async (_userId, start, end) =>
      completions.filter((completion) => completion.occurred_on >= start && completion.occurred_on <= end),
  };
};

describe("GET /week", () => {
  it("returns expected/completed totals and progress", async () => {
    const env = makeEnv();
    const response = await worker.fetch(
      new Request("https://example.test/week?start=2026-03-02", {
        headers: {
          Authorization: "Bearer owner-token",
        },
      }),
      env,
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.expected_count).toBe(8);
    expect(body.completed_count).toBe(4);
    expect(body.progress_percent).toBe(50);
  });

  it("requires start query param", async () => {
    const env = makeEnv();
    const response = await worker.fetch(
      new Request("https://example.test/week", {
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
