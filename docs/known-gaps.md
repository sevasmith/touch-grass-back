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

## CI

- The `docker-build` job's container smoke test (`.github/workflows/ci.yml`) still soft-fails on purpose — it doesn't provision a Postgres service or pass any env vars to `docker run`, so the container can't actually boot inside that job yet. To make the health-check curl a real (hard-failing) check, that job needs the same `postgres:` service + full env var set that `e2e-tests` already has.
