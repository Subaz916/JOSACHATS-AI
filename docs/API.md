# API reference

All application endpoints start with `/api`. Authenticated endpoints require `Authorization: Bearer <supabase_access_token>`. Public endpoints do not require a token.

## Public

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET | `/api/health` | Service health |
| GET | `/api/config` | Safe browser config and capabilities |
| GET | `/api/plans` | Active subscription plans |
| POST | `/api/public/agents/:slug/conversations` | Start public conversation |
| GET | `/api/public/conversations/:token` | Read public conversation |
| POST | `/api/public/conversations/:token/messages` | Send message and get AI reply |
| POST | `/api/public/conversations/:token/feedback` | Submit rating |
| POST | `/api/public/conversations/:token/handoff` | Request human support |

`x-channel: voice` marks voice interactions. Omit it for text.

## Agents and knowledge

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET | `/api/agents` | List workspace agents |
| POST | `/api/agents` | Create agent with `payload` JSON plus optional files |
| GET | `/api/agents/:id` | Read agent |
| PATCH | `/api/agents/:id` | Update agent |
| DELETE | `/api/agents/:id` | Delete agent |
| POST | `/api/agents/:id/publish` | Set `active`, `inactive`, or `draft` |
| GET | `/api/agents/:id/share` | Public URL and QR image |
| GET | `/api/knowledge` | List knowledge sources |
| POST | `/api/knowledge` | Add manual, FAQ, URL, or file source |
| DELETE | `/api/knowledge/:id` | Delete source |

Agent creation uses multipart form data:

- `payload`: JSON string matching `agentSchema`
- `logoFile`: optional image
- `knowledgeFiles`: up to 10 documents

## Catalog, conversations, analytics

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET/POST | `/api/products` | List or create products |
| PATCH/DELETE | `/api/products/:id` | Update or delete product |
| GET/POST | `/api/services` | List or create services |
| PATCH/DELETE | `/api/services/:id` | Update or delete service |
| GET | `/api/conversations` | List conversations |
| GET | `/api/conversations/:id` | Transcript and feedback |
| PATCH | `/api/conversations/:id` | Update status |
| GET | `/api/conversations/:id/export?format=csv` | Export transcript |
| GET | `/api/human-support` | List handoff requests |
| PATCH | `/api/human-support/:id` | Update request |
| GET | `/api/dashboard/overview` | Dashboard KPIs |
| GET | `/api/analytics?from=&to=` | Analytics data |

## Billing

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET | `/api/billing/subscription` | Current subscription and quota |
| POST | `/api/billing/checkout` | Create Safepay checkout with `planCode` |
| GET | `/api/billing/payments` | Payment history |
| GET | `/api/billing/payments/:id/status` | Refresh tracker status |
| POST | `/api/billing/cancel` | Cancel subscription |
| GET | `/api/billing/success?tracker=` | Verify redirect payment |
| POST | `/api/webhooks/safepay` | Signed Safepay webhook |

Valid `planCode` values: `starter`, `professional`, `business`.

## System and admin

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET/PATCH | `/api/settings` | Workspace settings |
| GET | `/api/notifications` | Notifications |
| PATCH | `/api/notifications/:id` | Mark notification read |
| GET/POST | `/api/integrations` | Integrations |
| GET/PATCH | `/api/system/settings` | Admin system settings |
| GET | `/api/admin/overview` | Platform KPIs |
| GET | `/api/admin/users` | User list |
| PATCH | `/api/admin/users/:id` | Suspend or activate user |
| GET/POST | `/api/admin/plans` | Plan management |
| PATCH/DELETE | `/api/admin/plans/:id` | Plan updates |
| GET | `/api/admin/agents` | All agents |
| GET | `/api/admin/payments` | All payments |
| GET | `/api/admin/logs` | Audit logs |

## Error shape

Errors use:

```json
{
  "error": {
    "message": "Human readable message",
    "details": {}
  }
}
```

Common statuses:

- `400` invalid request
- `401` missing or invalid token
- `403` quota, admin, or policy denial
- `404` resource not found
- `502` upstream provider failure
- `503` required integration not configured
