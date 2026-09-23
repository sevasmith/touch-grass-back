import { IsString } from 'class-validator';

export class OAuthExchangeDto {
  @IsString()
  token: string;
}
