import { describe, expect, it } from "vitest";
import worker from "../../src/worker/index.js";

const makeEnv = () => {
  const users = new Map([
    [
      "uid-me",
      {
        id: "user-uid-me",
        firebase_uid: "uid-me",
        email: "existing@example.com",
        display_name: "Existing Name",
        created_at: "2026-01-01T00:00:00.000Z",
      },
    ],
  ]);

  return {
    users,
    verifyFirebaseToken: async (token) => {
      if (token === "good-token") {
        return { uid: "uid-me", email: "existing@example.com", name: "Existing Name" };
      }
      if (token === "good-new-token") {
        return { uid: "uid-new", email: "new@example.com", name: "New Name" };
      }
      throw new Error("invalid token");
    },
    getProfileByFirebaseUid: async (firebaseUid) => users.get(firebaseUid) || null,
    upsertProfile: async (firebaseUid, updates) => {
      const current = users.get(firebaseUid);
      const next = {
        ...current,
        ...updates,
      };
      users.set(firebaseUid, next);
      return next;
    },
  };
};

describe("GET /me", () => {
  it("returns the user profile for a valid session", async () => {
    const env = makeEnv();
    const request = new Request("https://example.test/me", {
      headers: { Authorization: "Bearer good-token" },
    });
    const response = await worker.fetch(request, env);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.user).toMatchObject({
      id: "user-uid-me",
      email: "existing@example.com",
      display_name: "Existing Name",
    });
  });

  it("requires authorization for GET /me", async () => {
    const env = makeEnv();
    const request = new Request("https://example.test/me");
    const response = await worker.fetch(request, env);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe("unauthorized");
  });
});

describe("PUT /me", () => {
  it("updates profile display name and returns updated profile", async () => {
    const env = makeEnv();
    const request = new Request("https://example.test/me", {
      method: "PUT",
      headers: {
        Authorization: "Bearer good-token",
        "content-type": "application/json",
      },
      body: JSON.stringify({ display_name: "Updated Name" }),
    });
    const response = await worker.fetch(request, env);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.user.display_name).toBe("Updated Name");
  });

  it("requires payload for PUT /me", async () => {
    const env = makeEnv();
    const request = new Request("https://example.test/me", {
      method: "PUT",
      headers: {
        Authorization: "Bearer good-token",
        "content-type": "application/json",
      },
      body: JSON.stringify({}),
    });
    const response = await worker.fetch(request, env);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("bad_request");
  });
});
