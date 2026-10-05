export const JWT_ALGORITHM = 'HS256';
export const JWT_ISSUER = 'touch-grass-back';
export const JWT_AUDIENCE = 'touch-grass';

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 72;

export const FORGOT_PASSWORD_MIN_MS = 3_000;
export const PASSWORD_RESET_COOLDOWN_MS = 60_000;

export const EMAIL_VERIFICATION_CODE_LENGTH = 6;
export const EMAIL_VERIFICATION_RESEND_COOLDOWN_MS = 60_000;
export const EMAIL_VERIFICATION_MAX_ATTEMPTS = 5;

export const OAUTH_STATE_COOKIE = 'google-oauth-state';
export const OAUTH_STATE_COOKIE_MAX_AGE_MS = 5 * 60 * 1000;

export const LOGIN_THROTTLE = { default: { ttl: 60_000, limit: 5 } };
export const FORGOT_PASSWORD_THROTTLE = {
  default: { ttl: 900_000, limit: 3 },
};
export const VERIFY_EMAIL_THROTTLE = { default: { ttl: 60_000, limit: 5 } };
export const EMAIL_VERIFICATION_DAILY_CODE_LIMIT = 10;
export const EMAIL_VERIFICATION_DAILY_LIMIT_MS = 24 * 60 * 60 * 1000;
export const RESEND_VERIFICATION_THROTTLE = {
  default: { ttl: 900_000, limit: 3 },
};
export const CHANGE_PASSWORD_THROTTLE = { default: { ttl: 60_000, limit: 5 } };
