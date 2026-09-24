# CLAUDE.md

Guidance for Claude Code (or any agent) working in this repo. This is about the codebase's actual constraints and history-worth-knowing — not about how any individual person likes to be assisted.

## Stack

NestJS + TypeORM (Postgres) + Passport JWT, package manager is **pnpm** (not npm/yarn). Node 24.

## Commands

```bash
pnpm run start:dev          # dev server, watch mode
pnpm run typecheck          # tsc --noEmit
pnpm run lint                # eslint --fix
pnpm run test                # unit tests (jest)
pnpm run test:e2e            # e2e tests — needs a reachable Postgres
pnpm run migration:generate -- <path>   # do NOT use this form, see gotcha below
pnpm run migration:run       # applies pending migrations
```

## Hard rules

- **Schema changes go through migrations, never `synchronize: true`.** `TypeOrmModule`'s `synchronize` is `false` on purpose (`src/database/typeorm.config.ts`).
- **Refresh tokens and password-reset tokens are opaque `id.secret` strings, hashed with SHA-256 before storage — never JWTs.** This is deliberate: it makes them individually revocable and they carry no decodable payload. Don't "simplify" this to a JWT.
- **Any new required env var must be added to the Joi schema in `src/config/env.validation.ts`.** The app refuses to boot if a required var is missing — this is intentional fail-fast behavior, not a bug to work around. Since `ConfigModule.forRoot`'s validation runs at module-compile time, this also applies to **any test that imports `AppModule`**, not just real app boot (Jest e2e tests hit this too).
- **New env vars also need `.github/workflows/ci.yml`'s `e2e-tests` job env block updated**, and the corresponding secret/variable added in the repo's GitHub Settings (Secrets and variables → Actions). We've broken CI on this exact gap twice — it's easy to add a var locally and forget CI needs it too.

## Gotchas worth knowing before you hit them

- **`pnpm run migration:generate -- <path>` is broken** — pnpm forwards a literal `--` into the underlying CLI's argv, which breaks its positional-arg parsing. Use the direct form instead:
  ```bash
  pnpx typeorm-ts-node-commonjs migration:generate -d src/database/data-source.ts <path>
  ```
  `migration:generate` needs a reachable DB (it diffs entities against the live schema).
- **The husky pre-push hook runs `pnpm test` and hard-fails if zero `.spec.ts` files are found** (Jest's default behavior, not overridden here). Don't delete the last remaining unit test file without adding a replacement — this blocked a push after `app.controller.spec.ts` was removed with no replacement.
- **TypeORM's entity glob (`entities: [__dirname + '/**/*.entity...']` in `src/database/typeorm.config.ts`) is relative to that file's own location.** Moving the file without adjusting the relative path silently stops entity discovery from working.
- **The Dockerfile's `HEALTHCHECK` and `ci.yml`'s `docker-build` smoke test both curl `/health`.** If that route is ever renamed or moved, both need updating together or container health checks/CI break silently (well — CI's version currently soft-fails with a warning, on purpose, since that job doesn't provision a DB/env for the container yet).

## Established patterns — extend these, don't reinvent

- **Single-use tokens use a "claim-then-act" pattern**, not "check-then-act": an atomic conditional `UPDATE ... WHERE usedAt IS NULL` followed by checking `affected`, done *before* any other work happens. This is how both `AuthService.refresh()` and `AuthService.resetPassword()` avoid race conditions where the same token gets used twice concurrently. Any new single-use-token flow should follow the same shape.
- **Email fields are normalized via a `@Transform` decorator on the DTO** (trim + lowercase), typed as `({ value }: { value: unknown }) => ...` — not `any`, and not done in the service layer. See `login.dto.ts`/`forgot-password.dto.ts`/`signup.dto.ts` for the pattern.
- **A password reset is meant to be an instant, total logout**: it revokes all of the user's refresh tokens *and* invalidates already-issued access tokens (via `User.passwordChangedAt` compared against the JWT's `iat` claim in `JwtStrategy.validate()`), not just the tokens that happen to expire naturally afterward. Keep both halves in sync if this logic changes.
- **Reused/replayed tokens trigger revoking *all* of that user's sessions**, not just rejecting the one request — this is a deliberate "assume compromise" response, mirrored between refresh-token reuse and reset-token reuse.
- **Every route is one of three access tiers**: `@Public()` (no token), `@AllowUnverified()` (valid token, email may be unverified — only `verify-email`, `resend-verification`, `me`), or the default (valid token **and** `emailVerified`, enforced by `EmailVerifiedGuard`, a second `APP_GUARD` that must stay registered *after* `JwtAuthGuard`). New routes get the strict default; don't reach for `@Public()`/`@AllowUnverified()` to make something "just work". `emailVerified` is read from the DB in `JwtStrategy.validate()`, not from a JWT claim, so verifying takes effect on the user's existing access token.
- **Email OTP codes are the one exception to "reuse ⇒ revoke all sessions".** A 6-digit code is guessable, so `verify` claims an *attempt* atomically (cap of 5) before comparing, and exhausting attempts only invalidates that code — it deliberately does **not** revoke sessions. The full flow and its reasoning are in the README's "Email verification (OTP)" section.

## Deploy

GitHub Actions → ECR → ECS, repo `sevasmith/touch-grass-back`. `cd.yml` runs on push to `main` only. Health checks (container-level and CI smoke test) hit `GET /health`, which also verifies DB connectivity — it's not just a liveness ping.

## Where things live

- `docs/known-gaps.md` — running list of what's still outstanding (testing coverage, CI follow-ups, frontend dependencies, minor polish items). Check it before assuming something's unhandled, and update it as gaps get closed or new ones surface.
- `README.md` — setup instructions and the full API reference (request/response shapes, every error each endpoint can return).
