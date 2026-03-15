import { describe, expect, it } from "vitest";
import worker from "../../src/worker/index.js";

const buildEnv = () => {
  const users = new Map();

  return {
    users,
    verifyFirebaseToken: async (token) => {
      if (token === "valid-token") {
        return {
          uid: "uid-001",
          email: "first@example.com",
          name: "First User",
        };
      }

      if (token === "existing-user-token") {
        return {
          uid: "uid-002",
          email: "member@example.com",
          name: "Existing User",
        };
      }

      throw new Error("invalid token");
    },
    getUserByFirebaseUid: async (uid) => users.get(uid) || null,
    createUser: async ({ firebaseUid, email, displayName, createdAt }) => {
      const user = {
        id: `user-${firebaseUid}`,
        firebase_uid: firebaseUid,
        email,
        display_name: displayName,
        created_at: createdAt,
      };

      users.set(firebaseUid, user);
      return user;
    },
  };
};

describe("POST /session/verify", () => {
  it("creates a user on first login", async () => {
    const env = buildEnv();
    const request = new Request("https://example.test/session/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: "valid-token" }),
    });
    const response = await worker.fetch(request, env);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.user).toMatchObject({
      id: "user-uid-001",
      firebase_uid: "uid-001",
      email: "first@example.com",
      display_name: "First User",
    });
    expect(body.user.created_at).toBeTypeOf("string");
  });

  it("rejects invalid firebase tokens", async () => {
    const env = buildEnv();
    const request = new Request("https://example.test/session/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: "bad-token" }),
    });
    const response = await worker.fetch(request, env);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe("unauthorized");
  });

  it("bootstraps an existing user without creating a duplicate", async () => {
    const env = buildEnv();
    await worker.fetch(
      new Request("https://example.test/session/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: "existing-user-token" }),
      }),
      env,
    );
    const firstCall = env.users.get("uid-002");
    const response = await worker.fetch(
      new Request("https://example.test/session/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: "existing-user-token" }),
      }),
      env,
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(env.users.get("uid-002")).toBe(firstCall);
    expect(body.user).toMatchObject({ id: "user-uid-002" });
  });
});
