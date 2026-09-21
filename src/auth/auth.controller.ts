import { Controller, Get, Post, Body, Req } from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import { Public } from '../common/decorators/public.decorator';
import { Throttle } from '@nestjs/throttler';
import { LoginDto } from './dto/login.dto';
import { SignupDto } from './dto/signup.dto';
import { LogoutDto } from './dto/logout.dto';
import { RefreshDto } from './dto/refresh.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('signup')
  signup(@Body() dto: SignupDto) {
    return this.authService.signup(dto);
  }

  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @Public()
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Public()
  @Post('logout')
  logout(@Body() dto: LogoutDto) {
    return this.authService.logout(dto);
  }

  @Public()
  @Post('refresh')
  refresh(@Body() dto: RefreshDto) {
    return this.authService.refresh(dto);
  }

  @Throttle({ default: { ttl: 900_000, limit: 3 } })
  @Public()
  @Post('forgot-password')
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  @Public()
  @Post('reset-password')
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  @Get('me')
  me(@Req() req: Request) {
    return req.user;
  }
}
