# Known gaps

## Testing

- **Zero test coverage for the auth flow.** `src/health/health.controller.spec.ts` is currently the only unit test in the whole repo. Nothing exercises `signup`, `login`, `logout`, `refresh`, `forgot-password`, or `reset-password` — not the happy paths, not the error branches (invalid credentials, expired/reused/superseded tokens, rate limiting, etc.). This is the single highest-value thing to add next.
- No e2e tests beyond `test/health.e2e-spec.ts` either.
- **The Google OAuth flow is only manually verified** (real browser login, plus throwaway scratch probes). Nothing automated covers `AuthService.findOrCreateOAuthUser` (the linking rules and the concurrent-first-login recovery), `exchangeOAuthLoginToken`, `GoogleAuthGuard`'s `state` check, or `OAuthCallbackExceptionFilter`.

## Auth / OAuth

- **Email verification (OTP) isn't built yet.** Until it exists no password account has `emailVerified = true`, so signing in with Google to an email that already has a password account always ends in `?error=email_already_in_use` (linking is deliberately refused for unverified accounts). When OTP lands, it must be the thing that sets `emailVerified = true` — linking then starts working with no change. Consider also setting it on a successful password reset, since that link proves control of the inbox.
- **An unverified, never-verified password account "squats" its email**: it blocks the real owner from signing in with Google (they get `email_already_in_use`) until it's verified or removed. Consider expiring unverified accounts after some days; the owner can already recover through *forgot password*.
- **`GET /auth/google` (the start route) returns a plain JSON `429`** when rate-limited, because only the callback route has the redirecting `OAuthCallbackExceptionFilter`. Only reachable by hammering the route.
- **Password-less users can't be told apart in the API**: `login` returns the generic `401` for them by design, so the frontend can't suggest "you signed up with Google". Revisit if that becomes a UX problem (it would need an intentional account-enumeration trade-off).

## CI

- The `docker-build` job's container smoke test (`.github/workflows/ci.yml`) still soft-fails on purpose — it doesn't provision a Postgres service or pass any env vars to `docker run`, so the container can't actually boot inside that job yet. To make the health-check curl a real (hard-failing) check, that job needs the same `postgres:` service + full env var set that `e2e-tests` already has.
