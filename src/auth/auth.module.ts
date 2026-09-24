import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { APP_GUARD } from '@nestjs/core';
import { JwtStrategy } from './strategies/jwt.strategy';
import { GoogleStrategy } from './strategies/google.strategy';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService, ConfigModule } from '@nestjs/config';
import type { StringValue } from 'ms';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RefreshToken } from './entities/refresh-token.entity';
import { ResetToken } from './entities/reset-token.entity';
import { OAuthAccount } from './entities/oauth-account.entity';
import { OAuthLoginToken } from './entities/oauth-login-token.entity';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { MailModule } from '../mail/mail.module';
import { PassportModule } from '@nestjs/passport';

@Module({
  imports: [
    UsersModule,
    MailModule,
    TypeOrmModule.forFeature([
      RefreshToken,
      ResetToken,
      OAuthAccount,
      OAuthLoginToken,
    ]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: config.get<string>('JWT_ACCESS_TTL') as StringValue,
        },
      }),
    }),
    PassportModule.register({ session: false }),
  ],
  controllers: [AuthController],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    JwtStrategy,
    GoogleStrategy,
    AuthService,
  ],
})
export class AuthModule {}
