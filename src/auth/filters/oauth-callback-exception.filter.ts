import { ConfigService } from '@nestjs/config';
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';

@Catch()
export class OAuthCallbackExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(OAuthCallbackExceptionFilter.name);
  constructor(private readonly configService: ConfigService) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    const detail =
      exception instanceof Error
        ? `${exception.name}: ${exception.message}`
        : 'non-Error exception';

    let reason = 'oauth_failed';
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      switch (status) {
        case 401:
          reason = 'access_denied';
          break;
        case 409:
          reason = 'email_already_in_use';
          break;
        case 429:
          reason = 'too_many_requests';
          break;
      }
      this.logger.warn(
        `OAuth callback failed (HTTP ${status}): ${detail} -> redirecting with error=${reason}`,
      );
    } else {
      this.logger.error(
        `OAuth callback failed (unexpected): ${detail} -> redirecting with error=${reason}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    res.redirect(
      `${this.configService.getOrThrow<string>('FRONTEND_URL')}/oauth/complete?error=${reason}`,
    );
  }
}
