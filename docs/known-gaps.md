# Known gaps

## Testing

- **Zero test coverage for the auth flow.** `src/health/health.controller.spec.ts` is currently the only unit test in the whole repo. Nothing exercises `signup`, `login`, `logout`, `refresh`, `forgot-password`, or `reset-password` — not the happy paths, not the error branches (invalid credentials, expired/reused/superseded tokens, rate limiting, etc.). This is the single highest-value thing to add next.
- **The email verification (OTP) flow has no automated tests.** Nothing covers `EmailVerificationService` (`issue`, `verify`'s attempt cap / expiry / concurrent-claim / transaction, `resend`'s cooldown and mail-failure handling) or `EmailVerifiedGuard` (public, `@AllowUnverified()`, unverified, verified).
- No e2e tests beyond `test/health.e2e-spec.ts` either.
- **The Google OAuth flow is only manually verified** (real browser login, plus throwaway scratch probes). Nothing automated covers `AuthService.findOrCreateOAuthUser` (the linking rules and the concurrent-first-login recovery), `exchangeOAuthLoginToken`, `GoogleAuthGuard`'s `state` check, or `OAuthCallbackExceptionFilter`.

## Auth / OAuth

- **A completed password reset doesn't mark the email verified.** The reset link proves control of the inbox, so `resetPassword` could set `emailVerified = true` in its existing transaction (safe: it also replaces any password an attacker chose at signup). Today only the OTP does; a user who resets their password still has to enter a code.
- **An unverified, never-verified password account "squats" its email**: it blocks the real owner from signing in with Google (they get `email_already_in_use`) until it's verified or removed. Verification makes it *possible* to clear this, but nothing expires stale unverified accounts yet. Consider deleting them after some days; the owner can already recover through *forgot password*.
- **Email verification: throttling is per IP, not per user.** `verify-email` (5/min) and `resend-verification` (3/15 min) use the default IP tracker. The per-code attempt cap (5) and the 60 s resend cooldown are the real per-user limits. A per-user throttler tracker would be tighter.
- **Email verification: small edge cases left as-is.** (1) Two simultaneous `resend` calls can both pass the cooldown check and send two emails (the second code invalidates the first, so it isn't a security issue). (2) If the email provider fails on `resend`, the code row is already saved, so the 60 s cooldown still applies to the retry.
- **Pre-existing password accounts are all unverified** (they predate the feature). They can log in but are confined to `verify-email`, `resend-verification` and `me` until they verify. Nothing backfills or notifies them.
- **`GET /auth/google` (the start route) returns a plain JSON `429`** when rate-limited, because only the callback route has the redirecting `OAuthCallbackExceptionFilter`. Only reachable by hammering the route.
- **Password-less users can't be told apart in the API**: `login` returns the generic `401` for them by design, so the frontend can't suggest "you signed up with Google". Revisit if that becomes a UX problem (it would need an intentional account-enumeration trade-off).

## Deployment / rate limiting

- **Rate limiting will break as soon as a proxy/load balancer is put in front of the app, and is only approximate with more than one task.** Not a problem today (the app is exposed directly, and there is a single task), but it must be fixed at the same time as either change below.

  **How it works now.** `ThrottlerGuard` (`src/app.module.ts`) counts requests per key, where the key is the route plus the client's `req.ip`. Counts live in `@nestjs/throttler`'s default in-memory store, i.e. a plain map inside the Node process. `main.ts` does not set `trust proxy`, so `req.ip` is the address of whoever opened the TCP connection to Node. With no proxy in front, that is the real client, so every IP gets its own counter. That is correct today.

  **Problem 1: adding an ALB / CloudFront / nginx / any reverse proxy.** Every request then reaches Node from the proxy's own (private) IP. All users share one counter per route, e.g. 5 logins per minute for the whole world, so a few users can lock everyone out of `login`. The real client IP is in the `X-Forwarded-For` header the proxy adds, but Express ignores it unless told to trust it.
  - **Fix:** in `src/main.ts`, create the app as `NestFactory.create<NestExpressApplication>(AppModule)` (import from `@nestjs/platform-express`) and call `app.set('trust proxy', <hops>)`. `<hops>` is the number of proxies between the client and Node: `1` for an ALB directly in front, `2` for CloudFront then ALB. Do **not** use `true`, and do **not** set it while there is no proxy: the client could then send a forged `X-Forwarded-For` and pick its own IP to dodge the limit. If the hop count differs per environment, make it an env var, which means adding it to the Joi schema in `src/config/env.validation.ts` and to `ci.yml`'s `e2e-tests` env block (plus the GitHub Actions secret/variable).
  - **Verify after deploying:** log `req.ip` from two different networks; you should see two different client IPs, not the proxy's private `10.x` address.

  **Problem 2: running more than one ECS task.** Each task has its own in-memory map, and the load balancer spreads a client's requests across tasks, so the effective limit is roughly `limit x number of tasks` (5 logins/min becomes about 10 with 2 tasks). Limits still work per IP, just loosely.
  - **Fix:** move the counters to a shared store all tasks read and write, i.e. Redis (e.g. ElastiCache). Install a throttler Redis storage package (`@nest-lab/throttler-storage-redis` or `nestjs-throttler-storage-redis`) and pass it as `storage` to `ThrottlerModule.forRoot(...)` in `src/app.module.ts`. This needs a Redis instance and a new env var (e.g. `REDIS_URL`), with the same Joi and CI requirements as any new env var.

  Note that with multiple tasks you will almost certainly also have a load balancer, so in practice both fixes land together.
- **The per-route limits in `auth.controller.ts` (5/min for login, 3 per 15 min for forgot-password, etc.) were chosen assuming per-IP counters** and should be re-checked once the fixes above are in, since people behind the same NAT (offices, mobile carriers) share an IP.

## CI

- The `docker-build` job's container smoke test (`.github/workflows/ci.yml`) still soft-fails on purpose — it doesn't provision a Postgres service or pass any env vars to `docker run`, so the container can't actually boot inside that job yet. To make the health-check curl a real (hard-failing) check, that job needs the same `postgres:` service + full env var set that `e2e-tests` already has.
