import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../users/users.service';
import { MailService } from '../mail/mail.service';
import { VerificationCode } from './entities/email-verification-code.entity';
import { User } from '../users/entities/user.entity';
import { DataSource, Repository, IsNull, LessThan } from 'typeorm';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { randomInt, createHash, randomUUID, timingSafeEqual } from 'crypto';
import ms from 'ms';
import type { StringValue } from 'ms';

const RESEND_COOLDOWN_MS = 60_000;
const MAX_ATTEMPTS = 5;

@Injectable()
export class EmailVerificationService {
  private readonly logger = new Logger(EmailVerificationService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly usersService: UsersService,
    private readonly mailService: MailService,
    @InjectRepository(VerificationCode)
    private readonly verificationCodeRepository: Repository<VerificationCode>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async issue(user: User): Promise<void> {
    const id = randomUUID();
    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    const codeHash = createHash('sha256').update(code).digest('hex');
    const codeTtl = this.configService.getOrThrow<string>(
      'EMAIL_VERIFICATION_TTL',
    ) as StringValue;
    const expiresAt = new Date(Date.now() + ms(codeTtl));

    await this.dataSource.transaction(async (manager) => {
      const verificationCodes = manager.withRepository(
        this.verificationCodeRepository,
      );
      await verificationCodes.update(
        { userId: user.id, usedAt: IsNull(), invalidatedAt: IsNull() },
        { invalidatedAt: new Date() },
      );
      await verificationCodes.insert({
        id,
        userId: user.id,
        codeHash,
        expiresAt,
      });
    });

    await this.mailService.sendEmailVerificationCode(user.email, code);
  }

  async resend(userId: string): Promise<void> {
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new UnauthorizedException();
    }
    if (user.emailVerified) {
      return;
    }

    const latest = await this.verificationCodeRepository.findOne({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
    if (
      latest &&
      Date.now() - latest.createdAt.getTime() < RESEND_COOLDOWN_MS
    ) {
      throw new HttpException(
        'Please wait a moment before requesting another code',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    try {
      await this.issue(user);
    } catch (err) {
      this.logger.error('Failed to send email verification code', err);
      throw new ServiceUnavailableException(
        'Unable to send the verification email, try again later',
      );
    }
  }

  async verify(userId: string, code: string): Promise<void> {
    const user = await this.usersService.findById(userId);
    if (!user) throw new UnauthorizedException();

    if (user.emailVerified) return;

    const record = await this.verificationCodeRepository.findOne({
      where: { userId, usedAt: IsNull(), invalidatedAt: IsNull() },
      order: { createdAt: 'DESC' },
    });
    if (!record) {
      throw new UnauthorizedException('Invalid or expired verification code');
    }
    if (record.expiresAt < new Date()) {
      throw new UnauthorizedException('Verification code expired');
    }

    const { affected: attemptClaimed } =
      await this.verificationCodeRepository.update(
        {
          id: record.id,
          usedAt: IsNull(),
          invalidatedAt: IsNull(),
          attempts: LessThan(MAX_ATTEMPTS),
        },
        { attempts: () => 'attempts + 1' },
      );
    if (!attemptClaimed) {
      await this.verificationCodeRepository.update(
        { id: record.id, usedAt: IsNull(), invalidatedAt: IsNull() },
        { invalidatedAt: new Date() },
      );
      throw new UnauthorizedException(
        'Too many attempts, please request a new verification code',
      );
    }

    const providedHash = createHash('sha256').update(code).digest();
    const savedHash = Buffer.from(record.codeHash, 'hex');
    if (!timingSafeEqual(providedHash, savedHash)) {
      throw new UnauthorizedException('Invalid verification code');
    }

    await this.dataSource.transaction(async (manager) => {
      const { affected } = await manager
        .withRepository(this.verificationCodeRepository)
        .update(
          { id: record.id, usedAt: IsNull(), invalidatedAt: IsNull() },
          { usedAt: new Date() },
        );
      if (!affected) {
        throw new UnauthorizedException('Invalid or expired verification code');
      }
      await this.usersService.markEmailVerified(userId, manager);
    });
  }
}
