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
  const vacations = new Map([
    ["existing", {
      id: "vacation-existing",
      user_id: "user-uid-owner",
      starts_at: "2026-03-10",
      ends_at: "2026-03-12",
      created_at: "2026-03-01T00:00:00.000Z",
      updated_at: "2026-03-01T00:00:00.000Z",
    }],
  ]);

  return {
    users,
    verifyFirebaseToken: async (token) => {
      if (token === "owner-token") {
        return { uid: "uid-owner", email: "owner@example.com" };
      }
      throw new Error("invalid token");
    },
    getProfileByFirebaseUid: async (firebaseUid) => users.get(firebaseUid) || null,
    listVacationWindowsForUser: async () => [...vacations.values()],
    createVacationWindow: async ({ id, userId, startsAt, endsAt, now }) => {
      const window = {
        id,
        user_id: userId,
        starts_at: startsAt,
        ends_at: endsAt,
        created_at: now,
        updated_at: now,
      };
      vacations.set(id, window);
      return window;
    },
    getVacationWindowsForUser: async (userId) =>
      [...vacations.values()].filter((vacation) => vacation.user_id === userId),
  };
};

describe("GET /vacations", () => {
  it("returns vacation windows for the user", async () => {
    const env = makeEnv();
    const response = await worker.fetch(
      new Request("https://example.test/vacations", {
        headers: {
          Authorization: "Bearer owner-token",
        },
      }),
      env,
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.windows).toHaveLength(1);
    expect(body.windows[0].starts_at).toBe("2026-03-10");
  });
});

describe("POST /vacations", () => {
  it("creates non-overlapping vacation windows", async () => {
    const env = makeEnv();
    const response = await worker.fetch(
      new Request("https://example.test/vacations", {
        method: "POST",
        headers: {
          Authorization: "Bearer owner-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({ starts_at: "2026-03-20", ends_at: "2026-03-22" }),
      }),
      env,
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.vacation.starts_at).toBe("2026-03-20");
    expect(body.vacation.ends_at).toBe("2026-03-22");
  });

  it("rejects overlapping vacation windows", async () => {
    const env = makeEnv();
    const response = await worker.fetch(
      new Request("https://example.test/vacations", {
        method: "POST",
        headers: {
          Authorization: "Bearer owner-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({ starts_at: "2026-03-11", ends_at: "2026-03-13" }),
      }),
      env,
    );
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toBe("conflict");
  });
});

