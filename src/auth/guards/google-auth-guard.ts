import {
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { randomBytes } from 'crypto';
import type { Request, Response } from 'express';

const STATE_COOKIE = 'google-oauth-state';

@Injectable()
export class GoogleAuthGuard extends AuthGuard('google') {
  private readonly logger = new Logger(GoogleAuthGuard.name);
  // @nestjs/passport calls our validate()'s `done` twice (ours + its own), so
  // handleRequest runs twice per request; only log the first, real outcome.
  private readonly logged = new WeakSet<object>();

  // Google sends the user back to the callback URL with `?code=...`
  // (or `?error=...` if they cancelled). That's Google's protocol, not ours.
  private isCallback(req: Request): boolean {
    return Boolean(req.query.code || req.query.error);
  }

  private describe(value: unknown): string {
    if (value instanceof Error) {
      const oauthError = (value as { oauthError?: unknown }).oauthError;
      return `${value.name}: ${value.message}${
        oauthError ? ` | google said: ${JSON.stringify(oauthError)}` : ''
      }`;
    }
    if (value && typeof value === 'object') return JSON.stringify(value);
    return typeof value === 'string' ? value : 'none';
  }

  getAuthenticateOptions(context: ExecutionContext) {
    const http = context.switchToHttp();
    if (this.isCallback(http.getRequest<Request>())) return undefined;

    const state = randomBytes(16).toString('base64url');
    http.getResponse<Response>().cookie(STATE_COOKIE, state, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 5 * 60 * 1000,
    });
    return { state };
  }

  canActivate(context: ExecutionContext) {
    const http = context.switchToHttp();
    const req = http.getRequest<Request>();

    if (this.isCallback(req)) {
      const cookies = (req.cookies ?? {}) as Record<string, string>;
      const expected = cookies[STATE_COOKIE] ?? '';

      http.getResponse<Response>().clearCookie(STATE_COOKIE);
      if (!expected || req.query.state !== expected) {
        this.logger.warn(
          `State check failed (${expected ? 'state mismatch' : 'no state cookie'}): ` +
            `host=${req.headers.host} stateInQuery=${Boolean(req.query.state)} ` +
            `cookieNames=[${Object.keys(cookies).join(',')}]`,
        );
        throw new UnauthorizedException('Invalid OAuth state');
      }
    }
    return super.canActivate(context);
  }

  handleRequest<TUser = unknown>(
    err: unknown,
    user: TUser,
    info: unknown,
    context: ExecutionContext,
    status?: unknown,
  ): TUser {
    const req = context.switchToHttp().getRequest<Request>();
    if (!this.logged.has(req)) {
      // Mark on the first call whatever the outcome, so the duplicate second
      // call (which always has no user) doesn't log a false rejection.
      this.logged.add(req);
      if (err || !user) {
        this.logger.warn(
          `Passport rejected the callback: err=[${this.describe(err)}] info=[${this.describe(info)}] status=${typeof status === 'number' ? status : 'n/a'}`,
        );
      }
    }
    return super.handleRequest(err, user, info, context, status);
  }
}
