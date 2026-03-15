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
  const items = new Map([
    [
      "item-1",
      {
        id: "item-1",
        title: "Read",
        recurrence: "daily",
        is_active: 1,
        household_id: null,
        owner_user_id: "user-uid-owner",
        created_at: "2026-03-01T00:00:00.000Z",
        updated_at: "2026-03-01T00:00:00.000Z",
      },
    ],
  ]);
  const completions = new Map();

  return {
    users,
    verifyFirebaseToken: async (token) => {
      if (token === "owner-token") {
        return { uid: "uid-owner", email: "owner@example.com" };
      }
      throw new Error("invalid token");
    },
    getProfileByFirebaseUid: async (firebaseUid) => users.get(firebaseUid) || null,
    getItemById: async (itemId) => items.get(itemId) || null,
    getHouseholdMembership: async () => null,
    getOccurrenceCompletion: async (itemId, date) => completions.get(`${itemId}:${date}`) || null,
    createOccurrenceCompletion: async ({ item_id, occurred_on, completed_at, user_id }) => {
      const row = {
        item_id,
        occurred_on,
        completed_at,
        user_id,
      };
      completions.set(`${item_id}:${occurred_on}`, row);
      return row;
    },
    deleteOccurrenceCompletion: async (itemId, date) => {
      completions.delete(`${itemId}:${date}`);
    },
  };
};

describe("POST /occurrences/complete", () => {
  it("writes completion for arbitrary date", async () => {
    const env = makeEnv();
    const response = await worker.fetch(
      new Request("https://example.test/occurrences/complete", {
        method: "POST",
        headers: {
          Authorization: "Bearer owner-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({ item_id: "item-1", date: "2026-03-10" }),
      }),
      env,
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.completion).toMatchObject({
      item_id: "item-1",
      occurred_on: "2026-03-10",
    });
  });

  it("is idempotent on repeat completion", async () => {
    const env = makeEnv();
    const payload = JSON.stringify({ item_id: "item-1", date: "2026-03-10" });
    await worker.fetch(
      new Request("https://example.test/occurrences/complete", {
        method: "POST",
        headers: {
          Authorization: "Bearer owner-token",
          "content-type": "application/json",
        },
        body: payload,
      }),
      env,
    );
    const response = await worker.fetch(
      new Request("https://example.test/occurrences/complete", {
        method: "POST",
        headers: {
          Authorization: "Bearer owner-token",
          "content-type": "application/json",
        },
        body: payload,
      }),
      env,
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.completion).toMatchObject({ item_id: "item-1", occurred_on: "2026-03-10" });
  });
});

describe("POST /occurrences/uncomplete", () => {
  it("removes completion entry", async () => {
    const env = makeEnv();
    await worker.fetch(
      new Request("https://example.test/occurrences/complete", {
        method: "POST",
        headers: {
          Authorization: "Bearer owner-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({ item_id: "item-1", date: "2026-03-10" }),
      }),
      env,
    );
    const response = await worker.fetch(
      new Request("https://example.test/occurrences/uncomplete", {
        method: "POST",
        headers: {
          Authorization: "Bearer owner-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({ item_id: "item-1", date: "2026-03-10" }),
      }),
      env,
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.completion).toBe(null);
  });

  it("is idempotent when already uncompleted", async () => {
    const env = makeEnv();
    const response = await worker.fetch(
      new Request("https://example.test/occurrences/uncomplete", {
        method: "POST",
        headers: {
          Authorization: "Bearer owner-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({ item_id: "item-1", date: "2026-03-10" }),
      }),
      env,
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.completion).toBe(null);
  });
});
