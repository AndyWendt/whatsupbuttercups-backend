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
