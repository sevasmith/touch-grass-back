import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, Profile } from 'passport-google-oauth20';
import { ConfigService } from '@nestjs/config';
import { OAuthAccountDto } from '../dto/oauth-account.dto';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(configService: ConfigService) {
    super({
      clientID: configService.get<string>('GOOGLE_OAUTH_CLIENT_ID')!,
      clientSecret: configService.get<string>('GOOGLE_OAUTH_CLIENT_SECRET')!,
      callbackURL: configService.get<string>('GOOGLE_CALLBACK_URL')!,
      scope: ['email', 'profile'],
    });
  }

  validate(
    accessToken: string,
    refreshToken: string,
    profile: Profile,
    done: (err: unknown, user?: OAuthAccountDto) => void,
  ) {
    const email = profile.emails?.[0]?.value;

    if (!email) {
      return done(new Error('Email not found'));
    }
    done(null, {
      provider: 'google',
      providerAccountId: profile.id,
      email,
      emailVerified: Boolean(profile.emails?.[0]?.verified),
    });
  }
}
