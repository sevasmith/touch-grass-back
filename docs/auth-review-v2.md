# auth-review-v2

Oct 3, 2026

## Verdict: 71 / 100

The auth **design** is excellent, about 88/100, and well above most real production codebases. **Production readiness** is about 60/100. Two things hold it back: there are no automated tests on any auth path, and the deploy pipeline has gaps that will bite on the next push to `main`.

So it isn't flawless yet. The core security decisions are right and well reasoned: opaque hashed tokens, claim-then-act single use, instant global logout, enumeration-resistant login and forgot-password, and a careful OAuth handoff. What is missing is the proof (tests) and the guard rails around it (abuse limits that work across IPs, audit logging, a working CD path). None of the issues below is a critical, exploitable-today hole. One issue (OTP brute force over time) is a realistic account pre-hijack path and should be fixed first.

Scope: every file under `src/`, `test/`, the migrations, `Dockerfile`, `docker-compose.yml`, `ci.yml`, `cd.yml`, `README.md`, `CLAUDE.md` and `docs/known-gaps.md` at commit `ca8e181` (branch `development`). `pnpm typecheck` passes; `pnpm test` passes (2 tests, both for `/health`). Items already listed in `known-gaps.md` are scored but marked as known.

## Scorecard

The overall score is the weighted average of nine areas. Tests and ops pull it down; everything that is actual auth logic scores in the mid-80s or higher.

| Area | Score | Weight | Why |
| --- | --- | --- | --- |
| Access control (3 tiers, guards) | 92 | 10% | Strict default, fail-closed `EmailVerifiedGuard`, `emailVerified` read from the DB, not a stale claim. |
| Tokens and sessions | 88 | 15% | Opaque hashed refresh tokens, rotation with reuse detection, `iss`/`aud`/alg pinned, instant logout-all. Reuse response skips access tokens and the user-row lock (I3). |
| Password flows | 86 | 15% | Constant-work login, timed forgot-password, token validated before the password is touched. No breached-password check, no per-account lockout. |
| Google OAuth | 86 | 10% | Code flow, `state` cookie, link by `sub`, refuse linking to unverified accounts, single-use handoff token. No PKCE. |
| Email verification (OTP) | 74 | 10% | Attempt claim is atomic and correct per code, but nothing caps codes per user over time (I1). |
| Docs | 95 | 5% | README, `CLAUDE.md` and `known-gaps.md` explain the why of every decision. Rare quality. |
| Ops, deploy, config | 60 | 10% | CD e2e job can't pass, Docker runs Node 22, no migration step, TTLs not validated at boot. |
| Abuse resistance | 58 | 10% | Per-IP, in-memory throttling only; 20/min global default hits every future route; signup can mail any address. |
| Automated tests | 20 | 15% | Zero tests on auth. The test infrastructure (Jest, e2e with Postgres in CI, pre-push hook) is in place. |

Weighted total: 70.9, rounded to **71**.

## What is genuinely excellent

These are the parts worth showing off as an example implementation. Keep them as they are.

- **Opaque, hashed, single-use tokens everywhere.** Refresh, reset and OAuth handoff tokens are `uuid.secret` with 32 random bytes, stored as SHA-256, compared with `timingSafeEqual`, and the UUID is validated before Postgres is touched.
- **Claim-then-act, applied consistently.** `refresh`, `resetPassword`, `exchangeOAuthLoginToken` and the OTP attempt counter all use a conditional `UPDATE … WHERE` plus `affected`, so concurrent replays can't both win.
- **Real instant logout.** `passwordChangedAt` and `tokensValidAfter` checked against `iat` in `JwtStrategy.validate()` kill live access tokens, not just refresh tokens. Keeping the two timestamps separate so "password changed" stays truthful is a mature call.
- **Lock ordering is designed, not accidental.** `refresh`, `change-password`, `logout-all` and `reset-password` all touch the `users` row first inside the transaction, which closes the refresh-vs-revoke race.
- **Enumeration resistance done properly.** `login` always runs exactly one argon2 verify (dummy hash for missing or password-less users). `forgot-password` starts its 3 s timer before doing work. Most implementations get one of these wrong.
- **No password oracle in reset.** The token is fully validated before the submitted password is used, and the old "must differ" check was removed for exactly that reason.
- **OAuth handled like a security engineer would.** Backend code flow with the secret server-side, an HttpOnly `SameSite=Lax` `state` cookie against login CSRF, identity keyed on Google's `sub`, refusal to link onto an unverified local account (blocks the classic pre-hijack), and a throwaway handoff token instead of real tokens in the URL.
- **OTP thinking is precise.** Atomic attempt claim, a cap of 5, "exhaustion kills the code, not the sessions", and an honest note that hashing a 6-digit code is hygiene, not protection.
- **Strict-by-default access tiers.** A new route is verified-users-only unless someone opts out on purpose.
- **Fail-fast config.** Joi schema, `JWT_SECRET` min 32 chars, HS256 plus `iss`/`aud` pinned on both sign and verify.
- **Documentation is the best part of the repo.** Every decision has its reasoning and its rejected alternatives written down, and `known-gaps.md` is honest about what is missing.

## Issues found

No critical issues. Two are high: an OTP pre-hijack path and a CD pipeline that can't pass. Issues already listed in `docs/known-gaps.md` are at the end and are not repeated in detail.

### High

**I1. The email OTP can be brute-forced over days, which enables an account pre-hijack.** `src/auth/email-verification.service.ts:69-101` — **FIXED** (10 codes per user per rolling 24 h in `resend`, so at most 50 guesses a day; no automated test yet)
The 5-attempt cap is per code, and a new code is available every 60 s per user. Nothing caps the total. An attacker who signs up as `victim@gmail.com` and rotates IPs (to dodge the 3/15 min resend throttle) gets 60 codes × 5 guesses = 300 guesses per hour against 1,000,000 values: about a 0.7% chance per day, about 20% per month. Once that account is verified, the real owner's first "Sign in with Google" **links Google onto the attacker's account**, and the attacker still knows the password. This is the exact attack the linking rule was built to stop. Each resend also emails the victim, so it doubles as a mail-bombing channel.
*Fix:* add a per-user lifetime budget: for example, at most 10 codes or 25 failed attempts per 24 h, counted from `email_verification_codes`. After that, refuse `resend` with `429` until the window passes. Optionally grow the cooldown (60 s, 2 min, 5 min…).

**I2. The CD pipeline will fail on the next push to `main`.** `.github/workflows/cd.yml:77`
The `e2e-tests` job in `cd.yml` has no Postgres service and no env block. `test/health.e2e-spec.ts` imports `AppModule`, so Joi refuses to boot and the job fails, which blocks `build-and-push` and `deploy`. The last CD run (28 Aug) predates this test. `ci.yml` has the right setup; `cd.yml` was never updated. This is the same "CI needs the env too" gap `CLAUDE.md` warns about, in the second workflow.
*Fix:* copy the `services: postgres` block and the full `env:` block from `ci.yml`'s `e2e-tests` into `cd.yml`'s.

### Medium

**I3. Reuse detection revokes refresh tokens but leaves access tokens alive and skips the user-row lock.** **(FIXED: both reuse branches call `logoutAll()`; no automated test yet)** `src/auth/auth.service.ts:181-187` and `:310-316`
On refresh-token reuse and reset-token reuse, the code "assumes compromise" but only revokes refresh tokens, through the plain repository. A thief's current access token keeps working for the rest of `JWT_ACCESS_TTL`. And because the revoke isn't in a transaction that locks the `users` row first, a concurrent `refresh()` by the thief can commit a new refresh token the revoke never sees. `logout-all` already solves both problems.
*Fix:* call `this.logoutAll(userId)` in both reuse branches. It sets `tokensValidAfter` and revokes in the right lock order.

**I4. Zero automated tests on any auth path.** (known gap, but it is the biggest single score drag)
The security properties above are all subtle, and every one of them is a regression waiting to happen. `known-gaps.md` already lists the right first test cases.

**I5. `signup` can send email to any address at 20/min per IP.** **(PARTLY FIXED: now 10/hour per IP; no CAPTCHA and no global mail brake yet, see `known-gaps.md`)** `src/auth/auth.controller.ts:47-51`
It has no `@Throttle` of its own, and every signup emails a code to whatever address was submitted. That is a spam and mail-bombing relay, and it burns Brevo reputation and quota.
*Fix:* add a `SIGNUP_THROTTLE` in `auth.constants.ts` (for example 5 per hour per IP), and consider CAPTCHA or Turnstile on signup and forgot-password.

**I6. The global throttle of 20 requests/min per IP applies to every route, including all future app routes.** **(FIXED: global default is now 300/min; the auth routes keep strict per-route `@Throttle` limits, and every other auth route uses `AUTH_DEFAULT_THROTTLE` at 20/min, so no auth route is left on the global default)** `src/app.module.ts:17`
Any real app screen that fires a few requests will hit `429` quickly, worse behind a NAT. That limit makes sense for auth endpoints, not for authenticated API traffic.
*Fix:* set a high global default (for example 300/min) and keep the strict limits as per-route `@Throttle` on auth endpoints. Give `refresh` its own moderate limit.

**I7. Docker image runs Node 22; the project requires Node 24.** `Dockerfile:1`
`package.json` says `"node": ">=24.9"`, CI uses 24, `CLAUDE.md` says Node 24. Production runs something nothing else tests.
*Fix:* `FROM node:24-alpine AS base`.

**I8. Nothing runs migrations on deploy.** `cd.yml`, `Dockerfile`
The image has no TypeORM CLI and `data-source.ts` points at `src/**/*.ts`. The last commit adds `users.tokensValidAfter`, which `JwtStrategy` reads on every request: deploying before running that migration by hand makes every authenticated request a `500`.
*Fix:* add a compiled data source and a one-off ECS task (or a step before `deploy`) that runs `migration:run`, or set `migrationsRun: true` with the compiled migrations path.

**I9. TTL env vars aren't validated at boot.** **(FIXED: a `duration(min, max)` Joi helper requires an `ms`-parsable value with a unit inside a range: access `1m`–`1h`, refresh `1h`–`90d`, reset `1m`–`1h`, OAuth handoff `10s`–`5m`, email code `1m`–`1h`; no automated test yet. Note `15mins` is actually valid for `ms`; the typo that returned `undefined` is e.g. `15x`, and a bare `15` parses as 15 ms.)** `src/config/env.validation.ts:16-17, 23, 27, 29`
They are `Joi.string()`. A typo like `15mins` passes boot, then `ms()` returns `undefined` and every token insert fails at runtime. This breaks the repo's own fail-fast rule. There is also no upper bound, so `JWT_ACCESS_TTL=30d` would be accepted.
*Fix:* a custom Joi rule that requires `ms(value)` to be a positive number, with sensible maximums per variable.

**I10. No security audit log.** Successful and failed logins, password changes and resets, logout-all, reuse detections and OAuth links are not logged in a structured way. When a reuse detection fires in production, nobody will know.
*Fix:* one `logger.log` (or an `auth_events` table) per security event with `userId`, IP, user-agent and event type. Never log tokens or codes.

**I11. No per-account protection against credential stuffing.** Login is 10/min **per IP** only (it was 5/min when this review was written). A botnet gets 10 guesses per account per minute per IP, unlimited in total. There is no breached-password check either (NIST SP 800-63B recommends one).
*Fix:* a per-email failure counter with backoff (careful: it must not reveal whether the account exists), and a k-anonymity check against Have I Been Pwned on signup, reset and change.

### Low

**I12. Sessions never hard-expire.** **(FIXED: `refresh_tokens.sessionStartedAt` is carried forward on every rotation and capped at `SESSION_MAX_AGE_MS` = 90 days; `refresh` answers `401 Session expired` past it, and a new token's `expiresAt` never goes beyond the cap; no automated test yet)** `auth.service.ts:85-88` gives each rotated refresh token a fresh 30-day expiry, so a session refreshed regularly lives forever. *Fix:* carry the original `sessionStartedAt` forward and cap it (for example 90 days).

**I13. Refresh token storage on the web is left to the frontend.** **(ADDRESSED BY THE ARCHITECTURE: the frontend is a server-rendered Next.js app whose Node server keeps both tokens in secure cookies, so browser JavaScript never holds them; what remains is the frontend's responsibility to set the cookie attributes and to serialize refreshes, see the README "Who consumes this API" and `known-gaps.md`)** The refresh token comes back in the JSON body, so a browser SPA will likely put it in `localStorage`, where any XSS can read it. *Fix:* for the web client, consider an HttpOnly `SameSite=Strict` cookie scoped to `/auth/refresh`, or at least document the storage recommendation in the README.

**I14. No PKCE on the Google flow.** `src/auth/strategies/google.strategy.ts:10-15`. Not required for a confidential client, but current OAuth security guidance (RFC 9700) recommends it for all clients.

**I15. `resetPassword` burns the token before the password write.** **(FIXED: the claim now runs inside the same transaction, after the users update, so a failed hash or transaction leaves the link usable; a lost claim throws a local marker error that rolls the transaction back, and the reuse handling runs outside it; no automated test yet)** `auth.service.ts:301-336`. If the hash or transaction fails, the link is spent and the user has to request another. Moving the claim into the same transaction (after the `users` update) avoids that.

**I16. `changePassword` issues the new pair outside its transaction.** **(FIXED: `issueTokens(user, manager)` is the last statement inside the transaction, after the refresh-token revoke; no automated test yet)** `auth.service.ts:380`. If that insert fails after commit, the caller is logged out along with everyone else. Pass `manager` to `issueTokens` inside the transaction.

**I17. The access token carries an `email` claim nobody reads.** `auth.service.ts:75-78`. It is PII in every token and goes stale if email changes are ever added. `sub` alone is enough.

**I18. Pipeline and container cruft.** `cd.yml:119` prints the OIDC token payload on every deploy (debug leftover). `configure-aws-credentials@v4` and `github-script@v7` aren't SHA-pinned like every other action. `docker-compose.yml:13` health-checks `/` instead of `/health`. `ci.yml:172` points to `docs/forgot-reset-password-todo.md`, which doesn't exist.

### Found after the review

- **Graceful shutdown was missing** (`src/main.ts`). **(FIXED: `app.enableShutdownHooks()`; not yet verified against the real ECS stop timeout, see `known-gaps.md`)** A deploy could kill a committed `/auth/refresh` before its response was sent, and the Next.js retry then looked like a replay and revoked every session.

### Already in `known-gaps.md` (scored, not repeated)

- Throttling is in-memory and breaks behind a proxy or with more than one task (`trust proxy`, Redis).
- No cleanup of expired token and code rows.
- A completed password reset doesn't mark the email verified.
- Unverified accounts squat their email forever.
- `signup` and OAuth still reveal whether an email exists.
- No refresh grace window; clients must serialize refreshes.
- The `forgot-password` and `resend` cooldowns have small races.
- No authenticated "set first password" for Google-only users.

## Path to 90+

Six steps take the score from 71 to about 90. Tests are worth the most on their own (about +10). The rest are mostly small, contained code changes.

- [x] **Unblock deploys (I2, I7, I8).** *(done in code; I8 still needs the `ECS_SUBNETS`/`ECS_SECURITY_GROUPS` variables and IAM permissions set up in AWS/GitHub, and I18 is fixed too)* Copy the Postgres service and env block into `cd.yml`, move the image to Node 24, add a migration step before `deploy`. About an hour; prevents a broken or 500-ing production. *(+2 with step 5)*
- [x] **Cap OTP codes per user per day (I1).** *(done: 10 codes per rolling 24 h per user, checked in `resend`; see README "Resending a code")* One query and one constant. Closes the only realistic account-takeover path found. *(+1.5)*
- [x] **Route both reuse detections through `logoutAll()` (I3).** *(done and verified against the dev database)* Two-line change, makes "assume compromise" actually instant. *(+0.75)*
- [ ] **Write the auth test suite.** Start with the cases `known-gaps.md` lists, plus I1 and I3. Unit-test the services with mocked repositories; e2e-test the concurrency cases (refresh vs logout-all, parallel OTP guesses) against the CI Postgres. *(+10)*
- [ ] **Validate TTLs at boot and add security event logging (I9, I10).** *(I9 done: TTLs are validated and range-checked at boot; I10 security event logging still open)* *(+0.5)*
- [ ] **Harden abuse limits (I5, I6, I11 and the known proxy/Redis gap).** *(partly done: signup throttle of 10/hour per IP, plus per-account caps of 10 reset emails and 10 verification codes per 24 h; I6 global default now done (300/min app-wide, 20/min `AUTH_DEFAULT_THROTTLE` on the remaining auth routes); still open: I11 login backoff and breached-password check, `trust proxy`/Redis, CAPTCHA decision)* Signup throttle, a high global default with strict per-route limits, per-account login backoff, a breached-password check, and `trust proxy` plus Redis storage when the load balancer goes in. *(+3.5)*

After that, the Low items (absolute session lifetime, PKCE, refresh-token storage guidance, the small transaction tidy-ups) are polish. They would take an already strong example to the mid-90s.
