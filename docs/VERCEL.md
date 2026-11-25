# Vercel setup

Production URL used in this guide:

```text
https://josachatsaiagent.vercel.app
```

The repo includes `vercel.json` and `api/index.js`. Vercel serves static files from `frontend` and routes API, chat, agent, and fallback paths through the Express app as a serverless function.

## 1. Import repository

1. In Vercel, create a new project.
2. Import `Subaz916/JOSACHATS-AI`.
3. Set framework preset to `Other`.
4. Keep root directory at `.`.
5. Keep build command as `npm run build`.
6. Do not set an output directory. The serverless function serves the frontend.

## 2. Add environment variables

Add these variables in Vercel under Settings > Environment Variables. Add them to `Production`, `Preview`, and `Development` where needed.

```text
NODE_ENV=production
APP_URL=https://josachatsaiagent.vercel.app
PUBLIC_APP_URL=https://josachatsaiagent.vercel.app
PRODUCT_NAME=JOSA CHATS
CORS_ORIGINS=https://josachatsaiagent.vercel.app

SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key

AI_PROVIDER=openai-compatible
AI_API_URL=https://api.groq.com/openai/v1
AI_API_KEY=your-groq-api-key
AI_MODEL=llama-3.1-8b-instant
AI_TIMEOUT_MS=30000

SAFEPAY_SANDBOX=true
SAFEPAY_PRODUCTION_ENABLED=false
SAFEPAY_SECRET_KEY=your-safepay-secret-key
SAFEPAY_PUBLIC_KEY=your-safepay-public-key
SAFEPAY_WEBHOOK_SECRET=your-safepay-webhook-hmac-secret
SAFEPAY_INTENT=CYBERSOURCE
SAFEPAY_SUCCESS_URL=https://josachatsaiagent.vercel.app/billing.html?payment=success
SAFEPAY_CANCEL_URL=https://josachatsaiagent.vercel.app/billing.html?payment=cancelled

TTS_API_URL=
TTS_API_KEY=
STT_API_URL=
STT_API_KEY=

MAX_UPLOAD_MB=15
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX=120
LOG_LEVEL=info
```

Never add these values to GitHub. If a key was pasted in chat or committed, rotate it before going live.

For public widget embedding, set `CORS_ORIGINS` to trusted domains or `*`. Auth APIs remain protected by Supabase JWT.

## 3. Supabase setup

1. Set Site URL to `https://josachatsaiagent.vercel.app`.
2. Add redirect URLs:

```text
https://josachatsaiagent.vercel.app/auth/callback.html
https://josachatsaiagent.vercel.app/**
```

3. Enable Google provider in Supabase Auth.
4. Add Google OAuth client redirect URL in Google Cloud if the provider requires it.
5. Apply these SQL files in order in Supabase SQL editor:

```text
supabase/migrations/0001_initial_schema.sql
supabase/migrations/0002_rls_policies.sql
supabase/migrations/0003_functions_and_triggers.sql
supabase/seed.sql
```

6. Create private storage buckets:

```text
knowledge-files
agent-assets
audio
```

7. Confirm `admin_roles` contains the admin user that needs platform access.

## 4. Safepay setup

Set the sandbox webhook URL to:

```text
https://josachatsaiagent.vercel.app/api/webhooks/safepay
```

Keep `SAFEPAY_SANDBOX=true` and `SAFEPAY_PRODUCTION_ENABLED=false` until sandbox checkout, tracker lookup, and signed webhook delivery pass. Production checkout stays disabled while keys are placeholders.

## 5. Redeploy and verify

After variables are saved, redeploy the Vercel project. Then check:

```text
https://josachatsaiagent.vercel.app/api/health
https://josachatsaiagent.vercel.app/api/config
https://josachatsaiagent.vercel.app/api/system/health
https://josachatsaiagent.vercel.app/
https://josachatsaiagent.vercel.app/login.html
https://josachatsaiagent.vercel.app/shahryar-demo
```

`/api/config` must report real Supabase and AI capability state without exposing secrets.

## 6. Function limits

Vercel runs the Express app as a serverless function. Keep `AI_TIMEOUT_MS` below the function timeout for the Vercel plan. Long-lived background workers are not part of this deployment. Current features use request-response handlers only.

## 7. Updates

Push to `main`. Vercel builds automatically. Local verification before push:

```bash
npm run build
npm test
```
