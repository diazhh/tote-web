# Stack Research

**Domain:** Multi-provider webhook ingestion system (PUSH-based, added to existing lottery app)
**Researched:** 2026-04-01
**Confidence:** HIGH

---

## Context: What Already Exists

The following are **already in place** and must NOT be re-added or swapped out:

| Existing Capability | Package | Status |
|--------------------|---------|--------|
| Body parsing | `express.json()` (Express built-in) | Active |
| General rate limiting | `express-rate-limit ^7.4.1` | Active — global on `/api/` |
| Token generation (user auth) | `jsonwebtoken ^9.0.2` + `uuid ^13.0.0` | Active |
| Schema validation | `zod ^3.23.8` | Active |
| Cryptographic primitives | Node.js built-in `crypto` | Available (no install) |
| Request logging | Winston (`winston ^3.17.0`) | Active |
| Database | Prisma + PostgreSQL via `lib/prisma.js` | Active |

---

## New Capabilities Needed

### 1. Raw Body Preservation for Signature Verification

**Problem:** `app.use(express.json())` in `src/index.js` (line 99) parses the body globally before any route handler runs. HMAC signature verification requires the exact raw bytes as received — any JSON re-serialization invalidates the signature.

**Solution:** Use the `verify` callback built into `express.json()`. No new package needed.

The `verify` option of `express.json()` fires before parsing, receiving `(req, res, buf, encoding)`. Attach `req.rawBody = buf` there. The global `express.json()` call must be updated to include this callback.

**Pattern:**
```javascript
app.use(express.json({
  verify: (req, res, buf) => {
    req.rawBody = buf; // Buffer, not string — keeps encoding neutral
  }
}));
```

Webhook routes that need raw body read `req.rawBody`; all other routes continue using `req.body` normally.

**Confidence:** HIGH — This is the canonical pattern used by Stripe, Shopify, GitHub, and documented in multiple official sources. It requires zero new dependencies and works with the existing global middleware setup.

---

### 2. Webhook Token Authentication

**Problem:** Each provider needs a unique opaque token to authenticate inbound webhooks. JWT is wrong here — webhooks are inbound machine-to-machine calls, not user sessions. A static shared secret per provider is the correct model.

**Solution:** Node.js built-in `crypto.randomBytes()`. No new package needed.

```javascript
import crypto from 'crypto';

// Generate a 32-byte (256-bit) hex token
const webhookToken = crypto.randomBytes(32).toString('hex');
// Result: 64-character hex string, e.g., "a3f9b2c1..."
```

Store the token in the `ApiSystem` model (new `webhookToken` field). On every incoming webhook, extract from `X-Webhook-Token` header (or `Authorization: Bearer <token>`) and do a constant-time comparison:

```javascript
const expected = Buffer.from(storedToken, 'hex');
const received = Buffer.from(incomingToken, 'hex');
if (expected.length !== received.length || !crypto.timingSafeEqual(expected, received)) {
  return res.status(401).json({ error: 'Invalid token' });
}
```

`crypto.timingSafeEqual` prevents timing attacks. Never use `===` for token comparison.

**Confidence:** HIGH — Node.js built-in crypto is the standard for this. No third-party library adds value here.

---

### 3. HMAC Signature Verification (Optional, per-provider)

**Problem:** Some providers (if they follow the GitHub/Stripe/Shopify model) will include an HMAC-SHA256 signature of the payload in a request header. This is separate from the token auth above — token proves "who", HMAC proves "payload wasn't tampered."

**Solution:** Node.js built-in `crypto.createHmac()`. No new package needed.

```javascript
import crypto from 'crypto';

function verifyHmacSignature(rawBody, secret, receivedSignature) {
  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody) // rawBody must be Buffer, not parsed JSON
    .digest('hex');
  const expectedBuf = Buffer.from(`sha256=${expected}`, 'utf8');
  const receivedBuf = Buffer.from(receivedSignature, 'utf8');
  return expectedBuf.length === receivedBuf.length &&
    crypto.timingSafeEqual(expectedBuf, receivedBuf);
}
```

Whether a provider uses HMAC is determined by the adapter — the infrastructure supports it, but adapters opt in. For discovery mode (no adapter), skip HMAC verification and log the raw payload.

**Confidence:** HIGH — Standard pattern documented across Stripe, GitHub, and Shopify docs.

---

### 4. Per-Provider Rate Limiting

**Problem:** The existing global rate limiter (`generalLimiter`) applies per IP across all `/api/` routes. Webhooks need to be rate-limited per provider token, not per IP, because all requests from a single provider will share the same source IP (their server).

**Solution:** `express-rate-limit` (already installed at `^7.4.1`, latest is `8.x`). Use a second `rateLimit()` instance with a custom `keyGenerator` that extracts the provider slug from the route parameter.

```javascript
import rateLimit from 'express-rate-limit';

const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,  // 1 minute
  limit: 300,           // 300 requests/minute per provider
  keyGenerator: (req) => `webhook:${req.params.slug ?? 'unknown'}`,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many webhook requests from this provider' },
});

// Applied only to webhook routes, not globally
router.post('/:slug', webhookLimiter, webhookController.receive);
```

This is purely configuration — no new package, no new install. The existing `express-rate-limit` package already supports `keyGenerator`.

**Note on version:** The project has `^7.4.1`. The current latest is `8.x`. The `^` semver range will NOT auto-update to `8.x` (major version bump). No need to upgrade — v7 supports `keyGenerator` and all needed features. The option was renamed from `max` to `limit` in v7, which the project already uses (it targets `^7.4.1`).

**Confidence:** HIGH — `keyGenerator` is a documented, stable feature of express-rate-limit. Verified in official docs.

---

### 5. Payload Schema Validation

**Problem:** Webhook payloads from unknown providers must be accepted without rejection even if they don't match a schema (discovery mode). When an adapter exists, the adapter is responsible for validating and normalizing the payload.

**Solution:** `zod` (already installed at `^3.23.8`). Each adapter defines its own Zod schema. The base webhook infrastructure does NOT validate — it logs raw and passes to the adapter. The adapter uses `schema.safeParse()` to either normalize or signal "unknown format."

```javascript
// In an adapter file
const schema = z.object({
  ticket_id: z.string(),
  amount: z.number(),
  // ...
});

export function adapt(rawPayload) {
  const result = schema.safeParse(rawPayload);
  if (!result.success) return null; // Triggers discovery log
  return normalize(result.data);
}
```

**Confidence:** HIGH — Zod's `safeParse` is exactly the right tool; it never throws and returns a discriminated union.

---

## Summary: What to Install

**Nothing new needs to be installed.** All required capabilities are covered by:

1. Express built-in `express.json({ verify })` — raw body preservation
2. Node.js built-in `crypto` — token generation + HMAC verification + timing-safe comparison
3. `express-rate-limit` (already installed) — per-provider rate limiting via `keyGenerator`
4. `zod` (already installed) — adapter-level payload validation

---

## What NOT to Add

| Library | Why to Avoid | Use Instead |
|---------|-------------|-------------|
| `body-parser` (standalone) | Redundant — Express 4.16+ bundles it. Adding it separately creates a conflict with the existing `express.json()` call | `express.json({ verify })` built-in |
| `jwks-rsa` / JWT for webhook auth | JWTs are stateful session tokens, not API keys. Webhook tokens are static shared secrets — wrong tool | `crypto.randomBytes(32).toString('hex')` |
| `@stripe/stripe-node` or similar SDK | This project implements its own providers via adapters, not Stripe. SDK would pull in dead weight | Adapter pattern with raw `crypto` |
| `helmet` (additional config) | Already configured in `src/index.js`. Do not add a second `app.use(helmet())` | Extend existing helmet config if needed |
| Redis / external rate limit store | Volume is expected to be low (lottery betting webhooks). In-memory store is sufficient | Default in-memory store of `express-rate-limit` |
| `express-validator` | Zod is already in the project and more ergonomic for adapter schemas | Zod `safeParse` |
| `svix` or `hookdeck` | Third-party webhook management platforms — overkill for a self-hosted system with a small provider count | Express middleware + Prisma `WebhookLog` model |

---

## Integration Points with Existing Stack

### Middleware Ordering in `src/index.js`

The existing order is:
1. helmet
2. cors
3. generalLimiter (on `/api/`)
4. `express.json()` ← **update this to add `verify` callback**
5. `express.urlencoded()`
6. static files
7. request logging
8. routes

The `verify` callback on `express.json()` fires before parsing, so `req.rawBody` is populated on every request. Webhook routes can use it; all other routes ignore it.

### New `webhooks/` Module Structure

```
backend/src/
  routes/
    webhook.routes.js         ← POST /webhooks/:slug
  controllers/
    webhook.controller.js     ← Token auth, rate limit, adapter dispatch
  services/
    webhook.service.js        ← DB writes (WebhookLog), ticket creation
  webhooks/
    adapters/                 ← One file per provider slug
      {slug}.adapter.js
```

### Prisma Schema Additions

The `ApiSystem` model needs:
- `slug` String (unique) — used as route param and adapter filename key
- `webhookToken` String? (nullable until generated) — stored plain or hashed
- `mode` enum `PULL | PUSH` — controls which job type applies

New `WebhookLog` model for discovery/audit log (raw payload, timestamp, provider, processing status).

### Token Storage: Plain vs Hashed

Store webhook tokens **plain** (not hashed). Rationale:
- Unlike passwords, webhook tokens need to be compared for equality, not verified
- They may need to be re-displayed to the admin once (setup time)
- If the DB is compromised, the attacker already has network-level access to intercept webhooks anyway
- **However:** If the tokens must be displayed again after creation (e.g., admin copies token days later), storing plain is necessary
- Use `crypto.timingSafeEqual` at comparison time — timing attacks are the actual threat

If policy requires hashing: use `bcrypt` (already in the project at `^5.1.1`).

---

## Version Compatibility

| Package | Current in Project | Required Change |
|---------|--------------------|-----------------|
| `express` | `^4.21.1` | None — `express.json({ verify })` is stable since 4.16 |
| `express-rate-limit` | `^7.4.1` | None — `keyGenerator` is supported in v7 |
| `zod` | `^3.23.8` | None — `safeParse` is stable |
| `uuid` | `^13.0.0` | None — use for `WebhookLog` IDs |
| `crypto` | Node.js built-in | No install needed |

---

## Sources

- [Intercepting Raw HTTP Request Bodies (Medium)](https://stenzr.medium.com/intercepting-raw-http-request-bodies-ensuring-security-and-authenticity-in-webhooks-and-api-3b365b8a795b) — `express.json({ verify })` pattern — MEDIUM confidence (community article, pattern verified by Stripe docs)
- [Resolve webhook signature verification errors — Stripe Docs](https://docs.stripe.com/webhooks/signature) — Official source for raw body + `timingSafeEqual` — HIGH confidence
- [express-rate-limit Configuration Docs](https://express-rate-limit.mintlify.app/reference/configuration) — `keyGenerator` API, v7/v8 options — HIGH confidence
- [express-rate-limit npm (v8.3.2 latest)](https://www.npmjs.com/package/express-rate-limit) — Version confirmed — HIGH confidence
- [How to Implement HMAC Request Signing in Node.js — DEV Community](https://dev.to/1xapi/how-to-implement-hmac-request-signing-for-secure-api-authentication-in-nodejs-2026-guide-3b3f) — `crypto.createHmac` + `timingSafeEqual` pattern — MEDIUM confidence (community, pattern is Node.js standard)
- [Node.js Crypto API Docs](https://nodejs.org/api/crypto.html) — `randomBytes`, `createHmac`, `timingSafeEqual` — HIGH confidence
- [How to Implement SHA256 Webhook Signature Verification — Hookdeck](https://hookdeck.com/webhooks/guides/how-to-implement-sha256-webhook-signature-verification) — HMAC-SHA256 webhook pattern — MEDIUM confidence

---

*Stack research for: Multi-provider webhook system (PUSH-based) on top of existing tote-web Express backend*
*Researched: 2026-04-01*
