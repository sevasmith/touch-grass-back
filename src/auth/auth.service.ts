import { Injectable, UnauthorizedException } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { hash, verify } from 'argon2';
import { SignupDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';
import { LogoutDto } from './dto/logout.dto';
import { RefreshDto } from './dto/refresh.dto';
import { User } from '../users/entities/user.entity';
import { RefreshToken } from './entities/refresh-token.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { randomUUID, randomBytes, createHash, timingSafeEqual } from 'crypto';
import ms from 'ms';
import type { StringValue } from 'ms';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepository: Repository<RefreshToken>,
  ) {}

  private async issueTokens(user: User) {
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

  async signup(dto: SignupDto) {
    const passwordHash = await hash(dto.password);
    const user = await this.usersService.create(dto.email, passwordHash);
    return this.issueTokens(user);
  }

  async login(dto: LoginDto) {
    const user = await this.usersService.findByEmailWithPassword(dto.email);
    if (!user || !(await verify(user.passwordHash, dto.password))) {
      throw new UnauthorizedException('Invalid credentials');
    }
    await this.usersService.updateLastLoginAt(user.id);
    return this.issueTokens(user);
  }

  async logout(dto: LogoutDto) {
    const [id] = dto.refreshToken.split('.');
    await this.refreshTokenRepository.update(id, { revokedAt: new Date() });
  }

  async refresh(dto: RefreshDto) {
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
}
