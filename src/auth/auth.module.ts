import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { APP_GUARD } from '@nestjs/core';
import { JwtStrategy } from './strategies/jwt.strategy';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService, ConfigModule } from '@nestjs/config';
import type { StringValue } from 'ms';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RefreshToken } from './entities/refresh-token.entity';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';

@Module({
  imports: [
    UsersModule,
    TypeOrmModule.forFeature([RefreshToken]),
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
  ],
  controllers: [AuthController],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    JwtStrategy,
    AuthService,
  ],
})
export class AuthModule {}
