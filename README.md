# touch-grass-back

NestJS backend for touch-grass.

## Project setup

```bash
pnpm install
```

You'll need a local Postgres reachable with the credentials in `.env` (copy `.env.example` to `.env` and fill it in). Then run migrations:

```bash
pnpm run migration:run
```

Run the app:

```bash
pnpm run start:dev   # watch mode
pnpm run start       # single run
pnpm run start:prod  # from a build (node dist/main)
```

Run tests:

```bash
pnpm run test        # unit tests
pnpm run test:e2e    # e2e tests (needs a reachable Postgres)
pnpm run test:cov    # unit tests with coverage
```

## Environment variables

All of these are required — the app validates them at boot (via a Joi schema) and refuses to start if any are missing.

| Variable | Description |
|---|---|
| `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD`, `DB_NAME` | Postgres connection |
| `JWT_SECRET` | Signing secret for access tokens |
| `JWT_ACCESS_TTL` | Access token lifetime (e.g. `15m`) |
| `JWT_REFRESH_TTL` | Refresh token lifetime (e.g. `30d`) |
| `PASSWORD_RESET_TTL` | How long a password-reset link stays valid (e.g. `15m`) |
| `OAUTH_LOGIN_TOKEN_TTL` | How long the short-lived, single-use OAuth login handoff code stays valid (e.g. `60s`) |
| `FRONTEND_URL` | Used to build the link sent in the password-reset email (`${FRONTEND_URL}/reset-password?token=...`) |
| `CORS_ORIGINS` | **Comma-separated** list of allowed origins, e.g. `http://localhost:3000,https://app.touchgrass.com`. Not a JSON array — plain comma-separated string. |
| `BREVO_API_KEY` | API key for Brevo (transactional email provider), used to send password-reset emails |
| `MAIL_FROM_EMAIL`, `MAIL_FROM_NAME` | Sender identity for outgoing emails |
| `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` | Google OAuth 2.0 client credentials, from Google Cloud Console → APIs & Services → Credentials |
| `GOOGLE_CALLBACK_URL` | Must exactly match the redirect URI registered for the client above (e.g. `http://localhost:6767/auth/google/callback` locally) |
| `PORT` | Optional, defaults to `6767` |
| `NODE_ENV` | Optional, defaults to `development`. Set to `production` to disable verbose validation-error debug messages. |

## Authentication model 

- **Access tokens** are short-lived JWTs. Send them as `Authorization: Bearer <accessToken>` on any endpoint that requires auth. Don't try to decode/inspect them beyond that — treat as opaque from the frontend's perspective.
- **Refresh tokens** are opaque random strings (`id.secret` format internally, but the frontend should just treat the whole string as an opaque blob to store and send back). They are **single-use and rotate**: every call to `/auth/refresh` invalidates the token you sent and returns a brand-new `{ accessToken, refreshToken }` pair. Always persist the newest refresh token you receive — the old one stops working immediately after use.
- If a refresh token is reused after being invalidated (revoked or already-rotated), the backend treats that as a possible compromise and revokes **all** of that user's active refresh tokens — every session gets logged out, not just the one making the suspicious request.
- Resetting a password revokes all of the user's refresh tokens *and* invalidates any access token issued before the reset (even if that access token hasn't technically expired yet) — so a password reset is effectively an instant global logout.
- Standard error shape for all thrown exceptions (from Nest's default exception filter):
  ```json
  { "statusCode": 401, "message": "Invalid credentials", "error": "Unauthorized" }
  ```
  For validation errors (400s), `message` is an array of strings, one per failed field.
- Rate limiting: most routes allow 20 requests/minute per IP by default. `login` is capped at 5/minute, `forgot-password` at 3/15 minutes. Exceeding a limit returns `429 Too Many Requests`.

## Endpoints

### `POST /auth/signup`
Public. Creates a user and logs them in immediately.

**Body**
```json
{ "email": "user@example.com", "password": "at least 8 chars, max 72" }
```

**Success — `201 Created`**
```json
{ "accessToken": "...", "refreshToken": "..." }
```

**Errors**
| Status | Cause |
|---|---|
| `400` | Validation failed (invalid email, password outside 8–72 chars, missing fields) |
| `409` | Email already registered |

---

### `POST /auth/login`
Public. Rate limited: 5/min per IP.

**Body**
```json
{ "email": "user@example.com", "password": "..." }
```

**Success — `200 OK`**
```json
{ "accessToken": "...", "refreshToken": "..." }
```

**Errors**
| Status | Cause |
|---|---|
| `400` | Validation failed |
| `401` | Invalid credentials (wrong email or password — same message for both, to avoid leaking which one is wrong) |
| `429` | Rate limit exceeded |

---

### `POST /auth/logout`
Public (doesn't require an access token — just the refresh token being logged out).

**Body**
```json
{ "refreshToken": "..." }
```

**Success — `204 No Content`** (no body)

**Errors**
| Status | Cause |
|---|---|
| `400` | Validation failed (missing/non-string `refreshToken`) |

Note: this always returns `204` regardless of whether the refresh token actually exists or was already revoked — it's not an error to "log out" a token that's already invalid.

---

### `POST /auth/refresh`
Public. Rotates the refresh token — the one you send is invalidated, a new pair is issued.

**Body**
```json
{ "refreshToken": "..." }
```

**Success — `200 OK`**
```json
{ "accessToken": "...", "refreshToken": "..." }
```

**Errors**
| Status | Cause |
|---|---|
| `400` | Validation failed |
| `401` | `Invalid refresh token` — malformed, unrecognized, or doesn't match the stored hash |
| `401` | `Refresh token revoked` — reuse of an already-revoked token (this also revokes all of the user's other active refresh tokens) |
| `401` | `Refresh token expired` |
| `401` | `Refresh token already used` — the same token was raced/replayed |

---

### `POST /auth/forgot-password`
Public. Rate limited: 3 requests/15 min per IP.

**Body**
```json
{ "email": "user@example.com" }
```

**Success — `200 OK`** — always the same response, whether or not the email is registered (prevents account enumeration):
```json
{ "message": "If that email is registered, a reset link has been sent." }
```

**Errors**
| Status | Cause |
|---|---|
| `400` | Validation failed (invalid email) |
| `429` | Rate limit exceeded |

There is no `401`/`404` for an unknown email — that's intentional, not a bug. Requesting a new reset link invalidates any previously-issued, unused link for that user.

---

### `POST /auth/reset-password`
Public. Uses the token from the link sent by `forgot-password`.

**Body**
```json
{ "token": "...", "password": "at least 8 chars, max 72" }
```

**Success — `204 No Content`** — the password is changed and every active session (refresh token) for that user is revoked.

**Errors**
| Status | Cause |
|---|---|
| `400` | Validation failed |
| `401` | `Invalid reset token` — malformed, unrecognized, or doesn't match the stored hash |
| `401` | `New password must be different from your current password` |
| `401` | `Reset token expired` |
| `401` | `Reset token already used` — the token was already successfully consumed (this also revokes all of the user's active sessions, since it may indicate the link leaked) |
| `401` | `This reset link has been replaced by a newer request` — the user requested another reset link after this one was sent; this one is now stale. No session revocation in this case, since nothing was actually compromised. |

Frontend note: `already used` and `replaced by a newer request` are deliberately different messages — show the user something accurate rather than a generic "invalid link" for both, since the second case just means "check your most recent email."

---

### `GET /auth/me`
**Requires auth** — the only endpoint not marked public. Send `Authorization: Bearer <accessToken>`.

**Success — `200 OK`**
```json
{ "id": "uuid", "email": "user@example.com" }
```

**Errors**
| Status | Cause |
|---|---|
| `401` | Missing, malformed, or expired access token; or the token was issued before the user's most recent password reset (rejected even if not yet expired) |

---

### `GET /health`
Public. Not app-specific — used by infrastructure (Docker/ECS) to check the service and its DB connection are up. No practical reason for the frontend to call this, documented for completeness.

**Success — `200 OK`**
```json
{ "status": "ok" }
```

**Errors**
| Status | Cause |
|---|---|
| `503` | Database unreachable |