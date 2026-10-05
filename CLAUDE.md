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
- **A password reset is meant to be an instant, total logout**: it revokes all of the user's refresh tokens *and* invalidates already-issued access tokens (via `User.passwordChangedAt` compared against the JWT's `iat` claim in `JwtStrategy.validate()`), not just the tokens that happen to expire naturally afterward. Keep both halves in sync if this logic changes. **`POST /auth/change-password` follows the same mechanism** (it sets `passwordChangedAt` and revokes every refresh token, so every other session is logged out instantly), with one deliberate exception: it re-issues a fresh `{ accessToken, refreshToken }` pair to the calling device, so the person who just changed their password isn't logged out of the device they're using. Don't "fix" that by removing the re-issue. Inside its transaction it updates the `users` row first and touches `refresh_tokens` after, the same lock order `refresh()` relies on to avoid the refresh-vs-reset race; keep that order. `JwtStrategy` compares `iat` (whole seconds) against `passwordChangedAt` at second granularity, which is what lets the token issued right after the change through.
- **`POST /auth/logout-all` is the same "instant, total logout" with its own timestamp.** It sets `User.tokensValidAfter` and revokes every refresh token in one transaction; `JwtStrategy.validate()` rejects an access token whose `iat` is earlier than **either** `passwordChangedAt` or `tokensValidAfter` (both compared at second granularity). `tokensValidAfter` is separate from `passwordChangedAt` on purpose: "password changed" must stay truthful for anything that reads it later, so don't reuse that field for logout-all. In the transaction, update the `users` row first (this takes the row lock) and revoke refresh tokens after, through `manager`, not the plain repository, so a concurrent `refresh()` can't slip a new refresh token past the revoke. If you add another "invalidate everything" trigger, extend the same `JwtStrategy` check and revoke the refresh tokens in the same transaction.
- **Reused/replayed tokens trigger revoking *all* of that user's sessions**, not just rejecting the one request — this is a deliberate "assume compromise" response, mirrored between refresh-token reuse and reset-token reuse. Both branches call `AuthService.logoutAll(userId)`, so the response is instant and total: it sets `tokensValidAfter` (killing live access tokens) and revokes every refresh token in one transaction that locks the `users` row first. Don't revoke through the plain repository there; that leaves the thief's access token alive and lets a concurrent `refresh()` slip a new refresh token past the revoke. The *concurrent* race inside `refresh()` ("Refresh token already used") deliberately does not trigger this.
- **Every route is one of three access tiers**: `@Public()` (no token), `@AllowUnverified()` (valid token, email may be unverified — only `verify-email`, `resend-verification`, `me`), or the default (valid token **and** `emailVerified`, enforced by `EmailVerifiedGuard`, a second `APP_GUARD` that must stay registered *after* `JwtAuthGuard`). New routes get the strict default; don't reach for `@Public()`/`@AllowUnverified()` to make something "just work". `emailVerified` is read from the DB in `JwtStrategy.validate()`, not from a JWT claim, so verifying takes effect on the user's existing access token.
- **Email OTP codes are the one exception to "reuse ⇒ revoke all sessions".** A 6-digit code is guessable, so `verify` claims an *attempt* atomically (cap of 5) before comparing, and exhausting attempts only invalidates that code — it deliberately does **not** revoke sessions. The full flow and its reasoning are in the README's "Email verification (OTP)" section.
- **`login` and `forgot-password` are built to not reveal whether an email has an account — including by timing. Don't "optimize" them.** `login` always runs exactly one argon2 `verify` (against a dummy hash when the user is missing or has no password) before failing. `forgot-password` starts a timer first (`FORGOT_PASSWORD_MIN_MS`), does the real work, and only then awaits the timer, so every response takes at least that long; the minimum must stay above the worst realistic duration of the known-email path (DB work plus the mail call, which `MailService` aborts after 2000 ms). Never return early for an unknown email, never `await` the timer *after* sequential work, and keep it per-account-cooldown aware (no new link or email within `PASSWORD_RESET_COOLDOWN_MS`). `signup` and Google OAuth still reveal existence on purpose (see `docs/known-gaps.md`).
- **Don't act on a submitted password before the token is proven valid.** `resetPassword` used to compare the new password with the current one before checking the token, which turned it into a password-guessing oracle for anyone holding just a token id. Validate the token's hash, expiry and state first, and don't add a "must differ from the current password" check to that flow. (`change-password` can have one, because the caller has already proven the current password.)

## Deploy

GitHub Actions → ECR → ECS, repo `sevasmith/touch-grass-back`. `cd.yml` runs on push to `main` only. Health checks (container-level and CI smoke test) hit `GET /health`, which also verifies DB connectivity — it's not just a liveness ping.

`cd.yml`'s `deploy` job runs migrations before the service is updated: a one-off ECS task from the new image runs `node node_modules/typeorm/cli.js migration:run -d dist/database/data-source.js`, and a non-zero exit stops the deploy. It needs the `ECS_SUBNETS` and `ECS_SECURITY_GROUPS` GitHub Actions variables, and the old code keeps serving while it runs, so keep migrations additive. `data-source.ts` must keep working from both `src/` (ts-node) and `dist/` (compiled), which is why it builds its globs from `__dirname` and the file's own extension. The pnpm version is pinned once, in `package.json`'s `packageManager`; don't add a `version:` input to `pnpm/action-setup` (it errors when pnpm is specified twice).

## Where things live

- `docs/known-gaps.md` — running list of what's still outstanding (testing coverage, CI follow-ups, frontend dependencies, minor polish items). Check it before assuming something's unhandled, and update it as gaps get closed or new ones surface.
- `README.md` — setup instructions and the full API reference (request/response shapes, every error each endpoint can return).
- `src/auth/auth.constants.ts` — auth constants that aren't environment-specific: JWT claims, cooldowns, attempt caps, throttle settings, password length limits, the OAuth state cookie. New auth constants go there, not inline. Values that differ per environment stay env vars (see the Joi rule above).
