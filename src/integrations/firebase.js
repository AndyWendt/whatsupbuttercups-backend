import {
  createLocalJWKSet,
  createRemoteJWKSet,
  importPKCS8,
  jwtVerify,
  SignJWT,
} from "jose";

const DEFAULT_JWKS_URL =
  "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";
const DEFAULT_TOKEN_URL = "https://oauth2.googleapis.com/token";
const DEFAULT_FCM_BASE_URL = "https://fcm.googleapis.com/v1/projects";
const FCM_SCOPE = "https://www.googleapis.com/auth/firebase.messaging";

const decodeMaybeJson = (value) => {
  if (typeof value !== "string" || value.trim() === "") {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

const normalizePrivateKey = (value) => {
  if (typeof value !== "string") {
    return null;
  }

  return value.includes("\\n") ? value.replace(/\\n/g, "\n") : value;
};

const parseServiceAccount = (env = {}) => {
  const fromJson = decodeMaybeJson(env.FIREBASE_SERVICE_ACCOUNT_JSON);
  const projectId = env.FIREBASE_PROJECT_ID || fromJson?.project_id || null;
  const clientEmail = env.FIREBASE_CLIENT_EMAIL || fromJson?.client_email || null;
  const privateKey = normalizePrivateKey(
    env.FIREBASE_PRIVATE_KEY || fromJson?.private_key || null,
  );

  return {
    projectId,
    clientEmail,
    privateKey,
  };
};

const parseJwks = (value) => {
  if (typeof value !== "string" || value.trim() === "") {
    return null;
  }

  try {
    const parsed = JSON.parse(value);
    if (parsed && Array.isArray(parsed.keys)) {
      return parsed;
    }
  } catch {
    return null;
  }

  return null;
};

const buildPushMessage = (deviceToken, payload = {}) => ({
  message: {
    token: deviceToken,
    notification: payload.notification || undefined,
    data: payload.data
      ? Object.fromEntries(
        Object.entries(payload.data).map(([key, value]) => [key, String(value)]),
      )
      : undefined,
  },
});

const createTokenMinter = (config, deps = {}) => {
  const now = deps.now || Date.now;
  const fetchFn = deps.fetch || fetch;
  const tokenUrl = config.tokenUrl || DEFAULT_TOKEN_URL;

  let cache = {
    value: null,
    expiresAtMs: 0,
  };
  let signingKeyPromise;

  const getSigningKey = async () => {
    if (!signingKeyPromise) {
      signingKeyPromise = importPKCS8(config.privateKey, "RS256");
    }
    return signingKeyPromise;
  };

  return async () => {
    const nowMs = now();
    if (cache.value && nowMs < cache.expiresAtMs - 60_000) {
      return cache.value;
    }

    const signingKey = await getSigningKey();
    const iat = Math.floor(nowMs / 1000);
    const assertion = await new SignJWT({
      iss: config.clientEmail,
      sub: config.clientEmail,
      aud: tokenUrl,
      scope: FCM_SCOPE,
      iat,
      exp: iat + 3600,
    })
      .setProtectedHeader({ alg: "RS256", typ: "JWT" })
      .sign(signingKey);
    const tokenResponse = await fetchFn(tokenUrl, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion,
      }).toString(),
    });
    if (!tokenResponse.ok) {
      throw new Error("failed to obtain firebase access token");
    }

    const tokenPayload = await tokenResponse.json();
    if (!tokenPayload?.access_token) {
      throw new Error("firebase access token missing");
    }

    cache = {
      value: tokenPayload.access_token,
      expiresAtMs: nowMs + Number(tokenPayload.expires_in || 3600) * 1000,
    };
    return cache.value;
  };
};

const createVerifyFirebaseToken = (config, deps = {}) => {
  const jwks = config.jwksJson
    ? createLocalJWKSet(config.jwksJson)
    : createRemoteJWKSet(new URL(config.jwksUrl || DEFAULT_JWKS_URL));
  const issuer = `https://securetoken.google.com/${config.projectId}`;

  return async (token) => {
    const result = await jwtVerify(token, jwks, {
      issuer,
      audience: config.projectId,
    });
    const uid = result.payload.user_id || result.payload.sub;
    return {
      ...result.payload,
      uid,
    };
  };
};

const createSendPushNotification = (config, deps = {}) => {
  const fetchFn = deps.fetch || fetch;
  const fcmBaseUrl = config.fcmBaseUrl || DEFAULT_FCM_BASE_URL;
  const getAccessToken = createTokenMinter(config, deps);

  return async (deviceToken, payload) => {
    const accessToken = await getAccessToken();
    const response = await fetchFn(
      `${fcmBaseUrl}/${config.projectId}/messages:send`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(buildPushMessage(deviceToken, payload)),
      },
    );
    if (!response.ok) {
      throw new Error("firebase push send failed");
    }
    return response.json();
  };
};

export const bindFirebaseServicesToEnv = (env = {}, deps = {}) => {
  const config = parseServiceAccount(env);
  const output = { ...env };

  if (!output.verifyFirebaseToken && config.projectId) {
    output.verifyFirebaseToken = createVerifyFirebaseToken({
      projectId: config.projectId,
      jwksUrl: env.FIREBASE_JWKS_URL,
      jwksJson: parseJwks(env.FIREBASE_JWKS_JSON),
    }, deps);
  }

  if (
    !output.sendPushNotification &&
    config.projectId &&
    config.clientEmail &&
    config.privateKey
  ) {
    output.sendPushNotification = createSendPushNotification({
      projectId: config.projectId,
      clientEmail: config.clientEmail,
      privateKey: config.privateKey,
      tokenUrl: env.FIREBASE_OAUTH_TOKEN_URL,
      fcmBaseUrl: env.FIREBASE_FCM_BASE_URL,
    }, deps);
  }

  return output;
};
