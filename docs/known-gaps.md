# Known gaps

## Testing

- **Zero test coverage for the auth flow.** `src/health/health.controller.spec.ts` is currently the only unit test in the whole repo. Nothing exercises `signup`, `login`, `logout`, `refresh`, `forgot-password`, or `reset-password` — not the happy paths, not the error branches (invalid credentials, expired/reused/superseded tokens, rate limiting, etc.). This is the single highest-value thing to add next.
- No e2e tests beyond `test/health.e2e-spec.ts` either.

## CI

- The `docker-build` job's container smoke test (`.github/workflows/ci.yml`) still soft-fails on purpose — it doesn't provision a Postgres service or pass any env vars to `docker run`, so the container can't actually boot inside that job yet. To make the health-check curl a real (hard-failing) check, that job needs the same `postgres:` service + full env var set that `e2e-tests` already has.
