import { describe, expect, it } from "vitest";
import worker from "../../src/worker/index.js";

describe("error contracts", () => {
  it("adds correlation id to authorization error responses", async () => {
    const response = await worker.fetch(
      new Request("https://example.test/me", {
        headers: {
          "x-correlation-id": "corr-1",
        },
      }),
      {},
    );
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe("unauthorized");
    expect(body.correlation_id).toBe("corr-1");
  });

  it("returns internal_error payload on unhandled failures", async () => {
    const env = {
      verifyFirebaseToken: async () => ({ uid: "uid-owner", email: "owner@example.com" }),
      getProfileByFirebaseUid: async () => {
        return { id: "user-id", firebase_uid: "uid-owner" };
      },
      users: new Map([["uid-owner", { id: "user-id", firebase_uid: "uid-owner" }]]),
      listItemsForUser: async () => {
        throw new Error("storage down");
      },
    };
    const response = await worker.fetch(
      new Request("https://example.test/agenda?date=2026-03-10", {
        headers: {
          Authorization: "Bearer broken-token",
          "x-correlation-id": "corr-2",
        },
      }),
      env,
    );
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe("internal_error");
    expect(body.correlation_id).toBe("corr-2");
  });
});
