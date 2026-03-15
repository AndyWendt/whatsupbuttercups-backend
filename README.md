# whatsupbuttercups-backend

Cloudflare Worker backend for WhatsUpButtercups.

## API Documentation

See the full API reference in [docs/api.md](docs/api.md).

## Local Development

Install dependencies:

```bash
npm install
```

Run tests:

```bash
npm test
```

Run worker locally with Wrangler:

```bash
npx wrangler dev
```

## Configuration

### Cloudflare bindings

- `DB` (D1 database binding) is required for persistence-backed behavior.

### Firebase integration

The worker auto-enables Firebase helpers when these are configured:

- `FIREBASE_PROJECT_ID`
- `FIREBASE_SERVICE_ACCOUNT_JSON` (recommended single secret), or:
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY`

Optional overrides:

- `FIREBASE_JWKS_URL`
- `FIREBASE_JWKS_JSON`
- `FIREBASE_OAUTH_TOKEN_URL`
- `FIREBASE_FCM_BASE_URL`

## Deployment

Deploy with Wrangler:

```bash
npx wrangler deploy
```

## Local E2E Against Production

Use this when running E2E checks from your local machine against
`https://whatsupbuttercups.com` with real Firebase auth.

Prerequisites:

- Service account JSON on disk (do not commit it).
- `google-services.json` for the Android app (contains Firebase Web API key).

Generate a Firebase ID token locally:

```bash
export FIREBASE_SA_PATH="/absolute/path/to/service-account.json"
export GOOGLE_SERVICES_PATH="/home/andy/Desktop/code/apps/whatsupbuttercups-apps/whatsupbuttercups-apps/whatsupbuttercups-android/app/google-services.json"

ID_TOKEN=$(
node --input-type=module <<'NODE'
import fs from "node:fs/promises";
import { importPKCS8, SignJWT } from "jose";

const sa = JSON.parse(await fs.readFile(process.env.FIREBASE_SA_PATH, "utf8"));
const gs = JSON.parse(await fs.readFile(process.env.GOOGLE_SERVICES_PATH, "utf8"));
const apiKey = gs.client?.[0]?.api_key?.[0]?.current_key;
if (!apiKey) throw new Error("Missing api key in google-services.json");

const now = Math.floor(Date.now() / 1000);
const uid = `local-e2e-${Date.now()}`;
const aud =
  "https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit";
const privateKey = await importPKCS8(sa.private_key, "RS256");

const customToken = await new SignJWT({
  iss: sa.client_email,
  sub: sa.client_email,
  aud,
  uid,
})
  .setProtectedHeader({ alg: "RS256", typ: "JWT" })
  .setIssuedAt(now)
  .setExpirationTime(now + 3600)
  .sign(privateKey);

const response = await fetch(
  `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${apiKey}`,
  {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token: customToken, returnSecureToken: true }),
  },
);
const payload = await response.json();
if (!response.ok || !payload.idToken) {
  throw new Error(JSON.stringify(payload));
}
process.stdout.write(payload.idToken);
NODE
)
```

Bootstrap the backend user record:

```bash
curl -sS https://whatsupbuttercups.com/session/verify \
  -H "content-type: application/json" \
  -d "{\"token\":\"$ID_TOKEN\"}"
```

Call protected endpoints:

```bash
curl -sS https://whatsupbuttercups.com/me \
  -H "Authorization: Bearer $ID_TOKEN"
```

Notes:

- E2E calls against production write real data. Use unique test names/tokens and clean up test data when needed.
- ID tokens expire (typically ~1 hour). Regenerate when they expire.
