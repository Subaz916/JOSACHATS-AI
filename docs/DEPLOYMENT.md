# Deployment

## Requirements

- Node.js 18.18 or newer
- Supabase project with Auth, Database, and Storage
- HTTPS domain
- Safepay sandbox project
- Groq OpenAI-compatible API endpoint

## Vercel

For the hosted deployment, use `docs/VERCEL.md`. The repo includes `vercel.json` and `api/index.js`. Vercel serves `frontend` as static files and routes API and fallback paths through Express.

## Steps

1. Clone the project and run `npm install`.
2. Create `.env` from `.env.example`.
3. Set `APP_URL` and `PUBLIC_APP_URL` to the HTTPS domain.
4. Set Supabase URL, anon key, and service-role key.
5. Apply migrations and seed data.
6. Enable Google auth and add the callback URL.
7. Create storage buckets `knowledge-files`, `agent-assets`, and `audio`.
8. Set Safepay sandbox keys and webhook URL.
9. Set `CORS_ORIGINS` to trusted widget domains, or `*` for public embedding.
10. Run `npm run check`, `npm test`, then `npm start`.

## Process manager

```bash
npm start
```

For systemd or PM2, run `node backend/server.js` from the project root. Keep `.env` outside version control.

## Reverse proxy

Proxy all paths to Node. The Express app serves static frontend files and handles SPA fallback. Preserve the raw request body for `/api/webhooks/safepay`; do not rewrite or compress it before signature verification.

Recommended headers:

- `Strict-Transport-Security`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `X-Content-Type-Options: nosniff`

The app already sets several security headers through Helmet.

## Safepay

Start with:

```text
SAFEPAY_SANDBOX=true
SAFEPAY_PRODUCTION_ENABLED=false
```

Webhook URL:

```text
https://your-domain/api/webhooks/safepay
```

Test with Safepay sandbox cards. Confirm signed webhook delivery and tracker lookup before production.

## Voice

Browser voice works only when the user device provides speech APIs and local voices. Optional server proxies provide consistent TTS and STT. Never advertise offline voice unless the device reports a matching local voice.

## Monitoring

- `GET /api/health` for uptime checks
- `GET /api/system/health` for capability checks
- Admin audit logs in `audit_logs`
- Usage records in `usage_records`

## Backups

Back up the Supabase database and storage buckets. Keep service keys and webhook secrets in the deployment secret store. Never commit `.env`.
