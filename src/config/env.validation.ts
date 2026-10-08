import * as Joi from 'joi';
import ms from 'ms';
import type { StringValue } from 'ms';

const duration = (min: StringValue, max: StringValue) =>
  Joi.string()
    .required()
    .custom((value: string, helpers) => {
      let parsed: number | undefined;
      try {
        parsed = ms(value as StringValue);
      } catch {
        parsed = undefined;
      }
      if (
        typeof parsed !== 'number' ||
        !Number.isFinite(parsed) ||
        parsed < ms(min) ||
        parsed > ms(max)
      ) {
        return helpers.error('any.invalid');
      }
      return value;
    }, 'duration')
    .messages({
      'any.invalid': `{{#label}} must be a duration with a unit (e.g. "15m") between ${min} and ${max}`,
    });

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  PORT: Joi.number().default(6767),

  DB_HOST: Joi.string().required(),
  DB_PORT: Joi.number().required(),
  DB_USERNAME: Joi.string().required(),
  DB_PASSWORD: Joi.string().required(),
  DB_NAME: Joi.string().required(),

  JWT_SECRET: Joi.string().min(32).required(),
  JWT_ACCESS_TTL: duration('1m', '1h'),
  JWT_REFRESH_TTL: duration('1h', '90d'),

  BREVO_API_KEY: Joi.string().required(),
  MAIL_FROM_EMAIL: Joi.string().email().required(),
  MAIL_FROM_NAME: Joi.string().required(),

  PASSWORD_RESET_TTL: duration('1m', '1h'),
  FRONTEND_URL: Joi.string().uri().required(),
  CORS_ORIGINS: Joi.string().required(),

  OAUTH_LOGIN_TOKEN_TTL: duration('10s', '5m'),

  EMAIL_VERIFICATION_TTL: duration('1m', '1h'),

  GOOGLE_OAUTH_CLIENT_ID: Joi.string().required(),
  GOOGLE_OAUTH_CLIENT_SECRET: Joi.string().required(),
  GOOGLE_CALLBACK_URL: Joi.string().uri().required(),
});
