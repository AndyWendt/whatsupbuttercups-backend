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
  const households = new Map([
    ["house-1", { id: "house-1", name: "Home", creator_user_id: "user-uid-owner" }],
  ]);
  const householdMembers = new Map([["house-1:user-uid-owner", { household_id: "house-1", user_id: "user-uid-owner", role: "admin" }]]);
  const items = new Map();

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
    getHouseholdMembership: async (householdId, userId) =>
      householdMembers.get(`${householdId}:${userId}`) || null,
    createItem: async ({ id, household_id, owner_user_id, title, recurrence, is_active, created_at, updated_at }) => {
      const item = {
        id,
        household_id,
        owner_user_id,
        title,
        recurrence,
        is_active,
        created_at,
        updated_at,
      };
      items.set(id, item);
      return item;
    },
    listItemsForUser: async (userId) => {
      const userHouseholds = [...householdMembers.entries()]
        .filter(([, member]) => member.user_id === userId)
        .map(([key]) => key.split(":")[0]);
      return [...items.values()].filter((item) =>
        item.owner_user_id === userId || userHouseholds.includes(item.household_id),
      );
    },
    getItemById: async (id) => items.get(id) || null,
    updateItem: async (id, updates) => {
      const current = items.get(id);
      const next = {
        ...current,
        ...updates,
      };
      items.set(id, next);
      return next;
    },
  };
};

describe("POST /items", () => {
  it("creates personal items", async () => {
    const env = makeEnv();
    const request = new Request("https://example.test/items", {
      method: "POST",
      headers: {
        Authorization: "Bearer owner-token",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        title: "Read",
        recurrence: "daily",
      }),
    });

    const response = await worker.fetch(request, env);
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.item).toMatchObject({
      owner_user_id: "user-uid-owner",
      household_id: null,
      title: "Read",
      recurrence: "daily",
      is_active: 1,
    });
  });

  it("creates household items", async () => {
    const env = makeEnv();
    const request = new Request("https://example.test/items", {
      method: "POST",
      headers: {
        Authorization: "Bearer owner-token",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        title: "Pack",
        recurrence: "weekly",
        household_id: "house-1",
      }),
    });

    const response = await worker.fetch(request, env);
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.item.household_id).toBe("house-1");
  });
});

describe("GET /items", () => {
  it("returns personal and household visible items", async () => {
    const env = makeEnv();
    await worker.fetch(
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
    await worker.fetch(
      new Request("https://example.test/items", {
        method: "POST",
        headers: {
          Authorization: "Bearer owner-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          title: "Pack",
          recurrence: "weekly",
          household_id: "house-1",
        }),
      }),
      env,
    );

    const response = await worker.fetch(
      new Request("https://example.test/items", {
        headers: {
          Authorization: "Bearer owner-token",
        },
      }),
      env,
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.items).toHaveLength(2);
  });
});

describe("PATCH /items/:id", () => {
  it("updates allowed item fields", async () => {
    const env = makeEnv();
    const create = await worker.fetch(
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
    const created = await create.json();

    const update = await worker.fetch(
      new Request(`https://example.test/items/${created.item.id}`, {
        method: "PATCH",
        headers: {
          Authorization: "Bearer owner-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({ title: "Read Bible", recurrence: "weekly", is_active: false }),
      }),
      env,
    );
    const updated = await update.json();

    expect(update.status).toBe(200);
    expect(updated.item.title).toBe("Read Bible");
    expect(updated.item.recurrence).toBe("weekly");
    expect(updated.item.is_active).toBe(0);
  });
});
