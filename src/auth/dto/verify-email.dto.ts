import { IsString, Matches } from 'class-validator';
import { EMAIL_VERIFICATION_CODE_LENGTH } from '../auth.constants';

export class VerifyEmailDto {
  @IsString()
  @Matches(new RegExp(`^\\d{${EMAIL_VERIFICATION_CODE_LENGTH}}$`), {
    message: `code must be exactly ${EMAIL_VERIFICATION_CODE_LENGTH} digits`,
  })
  code: string;
}
