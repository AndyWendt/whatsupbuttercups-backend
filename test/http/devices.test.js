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
      },
    ],
  ]);
  const registrations = new Map();

  const clone = (value) => ({ ...value });

  return {
    users,
    verifyFirebaseToken: async (token) => {
      if (token === "owner-token") {
        return { uid: "uid-owner", email: "owner@example.com" };
      }
      throw new Error("invalid token");
    },
    getProfileByFirebaseUid: async (firebaseUid) => users.get(firebaseUid) || null,
    getDeviceRegistrationByToken: async (deviceToken) => registrations.get(deviceToken) || null,
    createDeviceRegistration: async ({
      id,
      userId,
      deviceToken,
      platform,
      now,
    }) => {
      const row = {
        id,
        user_id: userId,
        device_token: deviceToken,
        platform,
        created_at: now,
        updated_at: now,
      };
      registrations.set(deviceToken, row);
      return clone(row);
    },
    updateDeviceRegistration: async (existing, fields) => {
      const next = {
        ...existing,
        ...fields,
      };
      registrations.set(existing.device_token, next);
      return clone(next);
    },
  };
};

describe("POST /devices/register", () => {
  it("registers a new device token", async () => {
    const env = makeEnv();
    const response = await worker.fetch(
      new Request("https://example.test/devices/register", {
        method: "POST",
        headers: {
          Authorization: "Bearer owner-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          device_token: "abc123",
          platform: "ios",
        }),
      }),
      env,
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.device.device_token).toBe("abc123");
  });

  it("updates an existing token for same user", async () => {
    const env = makeEnv();
    await worker.fetch(
      new Request("https://example.test/devices/register", {
        method: "POST",
        headers: {
          Authorization: "Bearer owner-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          device_token: "abc123",
          platform: "ios",
        }),
      }),
      env,
    );
    const response = await worker.fetch(
      new Request("https://example.test/devices/register", {
        method: "POST",
        headers: {
          Authorization: "Bearer owner-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          device_token: "abc123",
          platform: "android",
        }),
      }),
      env,
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.device.platform).toBe("android");
  });
});

