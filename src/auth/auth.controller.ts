import {
  Controller,
  Get,
  Post,
  Body,
  Req,
  Res,
  HttpCode,
  HttpStatus,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import type { Response } from 'express';
import { AuthService } from './auth.service';
import { EmailVerificationService } from './email-verification.service';
import { Public } from '../common/decorators/public.decorator';
import { AllowUnverified } from '../common/decorators/allow-unverified.decorator';
import { Throttle } from '@nestjs/throttler';
import { LoginDto } from './dto/login.dto';
import { SignupDto } from './dto/signup.dto';
import { LogoutDto } from './dto/logout.dto';
import { RefreshDto } from './dto/refresh.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { OAuthExchangeDto } from './dto/oauth-exchange.dto';
import { OAuthAccountDto } from './dto/oauth-account.dto';
import { GoogleAuthGuard } from './guards/google-auth-guard';
import { OAuthCallbackExceptionFilter } from './filters/oauth-callback-exception.filter';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly emailVerificationService: EmailVerificationService,
  ) {}

  @Public()
  @Post('signup')
  signup(@Body() dto: SignupDto) {
    return this.authService.signup(dto);
  }

  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @HttpCode(HttpStatus.OK)
  @Public()
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Public()
  @Post('logout')
  logout(@Body() dto: LogoutDto) {
    return this.authService.logout(dto);
  }

  @HttpCode(HttpStatus.OK)
  @Public()
  @Post('refresh')
  refresh(@Body() dto: RefreshDto) {
    return this.authService.refresh(dto);
  }

  @Throttle({ default: { ttl: 900_000, limit: 3 } })
  @HttpCode(HttpStatus.OK)
  @Public()
  @Post('forgot-password')
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Public()
  @Post('reset-password')
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  @HttpCode(HttpStatus.OK)
  @Public()
  @Post('oauth/exchange')
  exchangeToken(@Body() dto: OAuthExchangeDto) {
    return this.authService.exchangeOAuthLoginToken(dto);
  }

  @Public()
  @UseGuards(GoogleAuthGuard)
  @Get('google')
  googleAuth() {}

  @Public()
  @UseGuards(GoogleAuthGuard)
  @UseFilters(OAuthCallbackExceptionFilter)
  @Get('google/callback')
  async googleCallback(@Req() req: Request, @Res() res: Response) {
    const redirectUrl = await this.authService.completeOAuthLogin(
      req.user as OAuthAccountDto,
    );
    return res.redirect(redirectUrl);
  }

  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @HttpCode(HttpStatus.NO_CONTENT)
  @AllowUnverified()
  @Post('verify-email')
  verifyEmail(@Req() req: Request, @Body() dto: VerifyEmailDto) {
    const { id } = req.user as { id: string };
    return this.emailVerificationService.verify(id, dto.code);
  }

  @Throttle({ default: { ttl: 900_000, limit: 3 } })
  @HttpCode(HttpStatus.NO_CONTENT)
  @AllowUnverified()
  @Post('resend-verification')
  resendVerification(@Req() req: Request) {
    const { id } = req.user as { id: string };
    return this.emailVerificationService.resend(id);
  }

  @AllowUnverified()
  @Get('me')
  me(@Req() req: Request) {
    return req.user;
  }
}
