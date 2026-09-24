import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator';
import { IS_UNVERIFIED_KEY } from '../../common/decorators/allow-unverified.decorator';

@Injectable()
export class EmailVerifiedGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()];

    const isPublic = this.reflector.getAllAndOverride<boolean>(
      IS_PUBLIC_KEY,
      targets,
    );
    const allowsUnverified = this.reflector.getAllAndOverride<boolean>(
      IS_UNVERIFIED_KEY,
      targets,
    );
    if (isPublic || allowsUnverified) return true;

    const { user } = context
      .switchToHttp()
      .getRequest<Request & { user?: { emailVerified?: boolean } }>();
    if (!user?.emailVerified) {
      throw new ForbiddenException('Email not verified');
    }
    return true;
  }
}
