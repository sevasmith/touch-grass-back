import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { MailService } from '../mail/mail.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { hash, verify } from 'argon2';
import { SignupDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';
import { LogoutDto } from './dto/logout.dto';
import { RefreshDto } from './dto/refresh.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { User } from '../users/entities/user.entity';
import { RefreshToken } from './entities/refresh-token.entity';
import { ResetToken } from './entities/reset-token.entity';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository, IsNull } from 'typeorm';
import { randomUUID, randomBytes, createHash, timingSafeEqual } from 'crypto';
import ms from 'ms';
import type { StringValue } from 'ms';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly mailService: MailService,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepository: Repository<RefreshToken>,
    @InjectRepository(ResetToken)
    private readonly resetTokenRepository: Repository<ResetToken>,
  ) {}

  private async issueTokens(
    user: User,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const accessToken = await this.jwtService.signAsync({
      sub: user.id,
      email: user.email,
    });

    const id = randomUUID();
    const secret = randomBytes(32).toString('base64url');
    const refreshToken = `${id}.${secret}`;
    const tokenHash = createHash('sha256').update(refreshToken).digest('hex');

    const refreshTtl = this.configService.get<string>(
      'JWT_REFRESH_TTL',
    ) as StringValue;
    const expiresAt = new Date(Date.now() + ms(refreshTtl));

    await this.refreshTokenRepository.insert({
      id,
      userId: user.id,
      tokenHash,
      expiresAt,
    });

    return { accessToken, refreshToken };
  }

  async signup(
    dto: SignupDto,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const passwordHash = await hash(dto.password);
    const user = await this.usersService.create(dto.email, passwordHash);
    return this.issueTokens(user);
  }

  async login(
    dto: LoginDto,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const user = await this.usersService.findByEmailWithPassword(dto.email);
    if (!user || !(await verify(user.passwordHash, dto.password))) {
      throw new UnauthorizedException('Invalid credentials');
    }
    await this.usersService.updateLastLoginAt(user.id);
    return this.issueTokens(user);
  }

  async logout(dto: LogoutDto): Promise<void> {
    const [id] = dto.refreshToken.split('.');
    await this.refreshTokenRepository.update(id, { revokedAt: new Date() });
  }

  async refresh(
    dto: RefreshDto,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const [id, secret] = dto.refreshToken.split('.');
    if (!id || !secret) {
      throw new UnauthorizedException('Invalid refresh token');
    }
    const refreshTokenRecord = await this.refreshTokenRepository.findOne({
      where: { id },
    });

    if (!refreshTokenRecord) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const providedHash = createHash('sha256').update(dto.refreshToken).digest();
    const savedHash = Buffer.from(refreshTokenRecord.tokenHash, 'hex');

    if (!timingSafeEqual(providedHash, savedHash)) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (refreshTokenRecord.revokedAt) {
      await this.refreshTokenRepository.update(
        { userId: refreshTokenRecord.userId, revokedAt: IsNull() },
        { revokedAt: new Date() },
      );
      throw new UnauthorizedException('Refresh token revoked');
    }

    if (refreshTokenRecord.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token expired');
    }

    const user = await this.usersService.findById(refreshTokenRecord.userId);
    if (!user) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const { affected } = await this.refreshTokenRepository.update(
      { id: refreshTokenRecord.id, revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
    if (!affected) {
      throw new UnauthorizedException('Refresh token already used');
    }

    return this.issueTokens(user);
  }

  async forgotPassword(dto: ForgotPasswordDto): Promise<{ message: string }> {
    const genericResponse = {
      message: 'If that email is registered, a reset link has been sent.',
    };

    const user = await this.usersService.findByEmail(dto.email);
    if (!user) {
      return genericResponse;
    }

    const id = randomUUID();
    const secret = randomBytes(32).toString('base64url');
    const resetToken = `${id}.${secret}`;
    const resetTokenHash = createHash('sha256')
      .update(resetToken)
      .digest('hex');

    const resetTtl = this.configService.get<string>(
      'PASSWORD_RESET_TTL',
    ) as StringValue;
    const resetTokenExpiresAt = new Date(Date.now() + ms(resetTtl));

    await this.dataSource.transaction(async (manager) => {
      const resetTokens = manager.withRepository(this.resetTokenRepository);
      await resetTokens.update(
        { userId: user.id, usedAt: IsNull(), invalidatedAt: IsNull() },
        { invalidatedAt: new Date() },
      );
      await resetTokens.insert({
        id,
        userId: user.id,
        tokenHash: resetTokenHash,
        expiresAt: resetTokenExpiresAt,
      });
    });

    const resetLink = `${this.configService.get<string>('FRONTEND_URL')}/reset-password?token=${resetToken}`;

    try {
      await this.mailService.sendPasswordResetEmail(user.email, resetLink);
    } catch (err) {
      this.logger.error('Failed to send password reset email', err);
    }

    return genericResponse;
  }

  async resetPassword(dto: ResetPasswordDto): Promise<void> {
    const [id, secret] = dto.token.split('.');

    if (!id || !secret) {
      throw new UnauthorizedException('Invalid reset token');
    }

    const tokenRecord = await this.resetTokenRepository.findOne({
      where: { id },
    });

    if (!tokenRecord) {
      throw new UnauthorizedException('Invalid reset token');
    }

    const user = await this.usersService.findByIdWithPassword(
      tokenRecord.userId,
    );

    if (user && (await verify(user.passwordHash, dto.password))) {
      throw new UnauthorizedException(
        'New password must be different from your current password',
      );
    }

    const providedHash = createHash('sha256').update(dto.token).digest();
    const savedHash = Buffer.from(tokenRecord.tokenHash, 'hex');

    if (!timingSafeEqual(providedHash, savedHash)) {
      throw new UnauthorizedException('Invalid reset token');
    }

    if (tokenRecord.expiresAt < new Date()) {
      throw new UnauthorizedException('Reset token expired');
    }

    const { affected } = await this.resetTokenRepository.update(
      { id: tokenRecord.id, usedAt: IsNull(), invalidatedAt: IsNull() },
      { usedAt: new Date() },
    );

    if (!affected) {
      const current = await this.resetTokenRepository.findOne({
        where: { id: tokenRecord.id },
      });
      if (current?.usedAt) {
        await this.refreshTokenRepository.update(
          { userId: tokenRecord.userId, revokedAt: IsNull() },
          { revokedAt: new Date() },
        );
        throw new UnauthorizedException('Reset token already used');
      }
      throw new UnauthorizedException(
        'This reset link has been replaced by a newer request',
      );
    }

    const newPasswordHash = await hash(dto.password);

    await this.dataSource.transaction(async (manager) => {
      await this.usersService.resetPassword(
        tokenRecord.userId,
        newPasswordHash,
        manager,
      );
      await manager
        .withRepository(this.refreshTokenRepository)
        .update(
          { userId: tokenRecord.userId, revokedAt: IsNull() },
          { revokedAt: new Date() },
        );
    });
  }
}
