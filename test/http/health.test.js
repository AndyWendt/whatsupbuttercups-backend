import { describe, expect, it } from "vitest";
import worker from "../../src/worker/index.js";

describe("GET /health", () => {
  it("returns an ok health payload", async () => {
    const request = new Request("https://example.test/health");
    const response = await worker.fetch(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(body).toMatchObject({
      service: "whatsupbuttercups-backend",
      status: "ok",
    });
    expect(body.timestamp).toBeTypeOf("string");
  });

  it("returns 404 for unknown endpoints", async () => {
    const request = new Request("https://example.test/does-not-exist");
    const response = await worker.fetch(request);

    expect(response.status).toBe(404);
  });
});
