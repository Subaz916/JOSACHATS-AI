# JOSA CHATS

JOSA CHATS is a multi-tenant AI customer support SaaS built with Node.js, Express, Vanilla JavaScript, Supabase, and Safepay. Businesses create branded agents, train them on real knowledge, deploy a public chat page or website widget, manage conversations and human handoff, and subscribe through Safepay Express Checkout.

## Stack

- Backend: Node.js 18+, Express ES modules
- Frontend: HTML5, CSS3, Vanilla JavaScript ES modules
- Database and auth: Supabase PostgreSQL, Supabase Auth, Supabase Storage
- Payments: Safepay Express Checkout v3 sandbox
- AI: Groq free-tier model through OpenAI-compatible chat completions API
- Documents: PDF via `pdf-parse`, DOCX via `mammoth`
- QR: `qrcode`

## Vercel

Production deployment guide: `docs/VERCEL.md`.

Production URL:

```text
https://josachatsaiagent.vercel.app
```

## Quick start

```bash
npm install
cp .env.example .env
supabase db push
supabase db reset --seed
npm run dev
```

Open `http://localhost:3000`.

If you do not use the Supabase CLI, apply these files in order in the Supabase SQL editor:

1. `supabase/migrations/0001_initial_schema.sql`
2. `supabase/migrations/0002_rls_policies.sql`
3. `supabase/migrations/0003_functions_and_triggers.sql`
4. `supabase/seed.sql`

Create storage buckets:

- `knowledge-files`
- `agent-assets`
- `audio`

Set each bucket to private except assets that must be publicly readable. Access to private files is controlled through Supabase policies and signed server access where required.

## Environment

Copy `.env.example` to `.env`. Required groups:

- App: `PORT`, `APP_URL`, `PUBLIC_APP_URL`, `PRODUCT_NAME`, `CORS_ORIGINS`
- Supabase: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- AI: `AI_PROVIDER=openai-compatible`, `AI_API_URL=https://api.groq.com/openai/v1`, `AI_MODEL=llama-3.1-8b-instant`, `AI_API_KEY=<groq_key>`
- Safepay sandbox: `SAFEPAY_SECRET_KEY`, `SAFEPAY_PUBLIC_KEY`, `SAFEPAY_WEBHOOK_SECRET`
- Offline voice: keep `TTS_API_URL`, `TTS_API_KEY`, `STT_API_URL`, and `STT_API_KEY` blank. Browser/local device voices are used when available.

Production Safepay stays disabled unless `SAFEPAY_SANDBOX=false` and `SAFEPAY_PRODUCTION_ENABLED=true`. Do not enable production until sandbox checkout, tracker lookup, and signed webhooks pass end to end.

`set CORS_ORIGINS=*` allows any website to call public APIs for widget embedding. Keep auth APIs protected with JWT; do not treat CORS as authentication.

## Supabase auth

1. Enable Google provider in Supabase Auth.
2. Set the site URL to `APP_URL`.
3. Add `http://localhost:3000/auth/callback.html` as a redirect URL during development.
4. Add `https://josachatsaiagent.vercel.app/auth/callback.html` as the production callback URL.
5. Create an admin row in `admin_roles` for admin access.

## Safepay webhook

Set the webhook URL to:

```text
https://josachatsaiagent.vercel.app/api/webhooks/safepay
```

The backend verifies HMAC-SHA512 using `SAFEPAY_WEBHOOK_SECRET` and header `X-SFPY-SIGNATURE`. Subscription activation also checks the Safepay tracker from the server. No subscription activates from redirect only.

## Frontend

Static files live in `frontend`.

- `/` landing page
- `/login.html` Google login
- `/auth/callback.html` OAuth callback
- `/dashboard.html` workspace overview
- `/create-agent.html` eight-step agent builder
- `/agents.html` agent management
- `/conversations.html` transcripts and feedback
- `/knowledge-base.html` knowledge sources
- `/products.html` products and services
- `/analytics.html` conversation analytics
- `/human-support.html` handoff inbox
- `/integrations.html` widget embed code
- `/billing.html` plans, checkout, payments
- `/settings.html` profile and workspace settings
- `/admin/` platform admin
- `/chat/:slug` public agent chat
- `/widget/demo.html` widget demo

Embed code generated in the dashboard:

```html
<script src="https://your-domain/widget/widget.js?agent=AGENT_ID" data-agent-id="AGENT_ID" data-color="#6d5efc" async></script>
```

## Voice behavior

Text chat works through the API. Voice input uses browser SpeechRecognition where available. Voice output prefers server audio when configured; otherwise it uses browser `speechSynthesis`. The app reports when no local voice is available. It does not claim offline speech when the device cannot provide it.

Optional server voice proxies accept POST JSON:

- `TTS_API_URL`: `{ text, language, voice }` returns audio bytes
- `STT_API_URL`: multipart field `file` returns `{ text }`

## Verification

```bash
npm run check
npm test
```

`npm run check` parses every JavaScript file. `npm test` runs validator, utility, config, and Safepay signature tests.

## Security notes

- Service-role keys stay on the server only.
- Auth routes use Supabase JWT verification.
- Admin routes check `admin_roles`.
- Webhook bodies stay raw for HMAC verification.
- Knowledge URL ingestion blocks private network hosts.
- Payments never activate from browser state alone.
- Secrets never appear in `/api/config`.
