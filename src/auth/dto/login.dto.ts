import { IsEmail, IsString, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { PASSWORD_MAX_LENGTH } from '../auth.constants';

export class LoginDto {
  @IsEmail()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  email: string;

  @MaxLength(PASSWORD_MAX_LENGTH)
  @IsString()
  password: string;
}
