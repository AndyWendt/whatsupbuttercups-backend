import { describe, expect, it, vi } from "vitest";
import {
  exportJWK,
  exportPKCS8,
  generateKeyPair,
  SignJWT,
} from "jose";
import { bindFirebaseServicesToEnv } from "../../src/integrations/firebase.js";

const secureTokenIssuerFor = (projectId) =>
  `https://securetoken.google.com/${projectId}`;

describe("firebase integration", () => {
  it("binds verifyFirebaseToken when firebase project id is present", () => {
    const bound = bindFirebaseServicesToEnv({
      FIREBASE_PROJECT_ID: "proj-1",
    });

    expect(typeof bound.verifyFirebaseToken).toBe("function");
  });

  it("does not override an existing verifyFirebaseToken binding", async () => {
    const verifyFirebaseToken = vi.fn(async () => ({ uid: "existing" }));
    const bound = bindFirebaseServicesToEnv({
      FIREBASE_PROJECT_ID: "proj-1",
      verifyFirebaseToken,
    });

    const claims = await bound.verifyFirebaseToken("token");
    expect(verifyFirebaseToken).toHaveBeenCalledOnce();
    expect(claims.uid).toBe("existing");
  });

  it("verifies firebase id token claims using jwks", async () => {
    const projectId = "test-proj";
    const { privateKey, publicKey } = await generateKeyPair("RS256", { extractable: true });
    const jwk = await exportJWK(publicKey);
    const token = await new SignJWT({
      sub: "uid-1",
      user_id: "uid-1",
      email: "user@example.com",
      name: "User",
      auth_time: Math.floor(Date.now() / 1000),
    })
      .setProtectedHeader({ alg: "RS256", kid: "test-kid" })
      .setIssuedAt()
      .setExpirationTime("10m")
      .setAudience(projectId)
      .setIssuer(secureTokenIssuerFor(projectId))
      .sign(privateKey);

    const fetchStub = vi.fn();
    const bound = bindFirebaseServicesToEnv({
      FIREBASE_PROJECT_ID: projectId,
      FIREBASE_JWKS_JSON: JSON.stringify({
        keys: [{ ...jwk, kid: "test-kid", alg: "RS256", use: "sig" }],
      }),
    }, {
      fetch: fetchStub,
    });

    const claims = await bound.verifyFirebaseToken(token);

    expect(claims.uid).toBe("uid-1");
    expect(claims.email).toBe("user@example.com");
    expect(fetchStub).not.toHaveBeenCalled();
  });

  it("binds sendPushNotification and sends to fcm", async () => {
    const projectId = "test-proj";
    const clientEmail = "svc@test-proj.iam.gserviceaccount.com";
    const { privateKey } = await generateKeyPair("RS256", { extractable: true });
    const pkcs8 = await exportPKCS8(privateKey);
    const fetchStub = vi.fn(async (url, init = {}) => {
      if (url === "https://example.test/token") {
        return new Response(
          JSON.stringify({
            access_token: "token-1",
            token_type: "Bearer",
            expires_in: 3600,
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      }

      if (url === `https://example.test/fcm/v1/projects/${projectId}/messages:send`) {
        const body = JSON.parse(init.body);
        expect(init.headers.Authorization).toBe("Bearer token-1");
        expect(body.message.token).toBe("device-1");
        expect(body.message.notification.title).toBe("Task reminder");
        return new Response(JSON.stringify({ name: "projects/test/messages/1" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }

      throw new Error(`unexpected fetch url: ${url}`);
    });
    const bound = bindFirebaseServicesToEnv({
      FIREBASE_PROJECT_ID: projectId,
      FIREBASE_CLIENT_EMAIL: clientEmail,
      FIREBASE_PRIVATE_KEY: pkcs8,
      FIREBASE_OAUTH_TOKEN_URL: "https://example.test/token",
      FIREBASE_FCM_BASE_URL: "https://example.test/fcm/v1/projects",
    }, {
      fetch: fetchStub,
      now: () => 1700000000000,
    });

    await bound.sendPushNotification("device-1", {
      notification: {
        title: "Task reminder",
        body: "Reminder for Read",
      },
      data: {
        item_id: "item-1",
      },
    });

    expect(fetchStub).toHaveBeenCalledTimes(2);
  });
});
