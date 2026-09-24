import { IsEmail, IsString, IsBoolean } from 'class-validator';
import { Transform } from 'class-transformer';

export class OAuthAccountDto {
  @IsString()
  provider: string;

  @IsString()
  providerAccountId: string;

  @IsEmail()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  email: string;

  @IsBoolean()
  emailVerified: boolean;
}
