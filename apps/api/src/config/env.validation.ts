import * as Joi from 'joi';

/**
 * Fail fast on boot when the environment is unsafe/incomplete — a mis-set
 * secret discovered at request time is far more expensive than a crash loop.
 */
export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
  API_PORT: Joi.number().default(4000),
  DATABASE_URL: Joi.string().uri({ scheme: ['postgresql', 'postgres'] }).required(),
  JWT_ACCESS_SECRET: Joi.string().min(16).required(),
  JWT_REFRESH_SECRET: Joi.string().min(16).required(),
  JWT_ACCESS_TTL: Joi.number().default(900),
  JWT_REFRESH_TTL: Joi.number().default(604800),
  ENCRYPTION_KEY: Joi.string().hex().length(64).required(),
  WEBHOOK_SIGNING_SECRET: Joi.string().min(16).required(),
  PUBLIC_URL: Joi.string().uri().default('http://localhost:3000'),
  CORS_ORIGINS: Joi.string().default('http://localhost:3000'),
  PAYMENT_SANDBOX: Joi.string().valid('true', 'false').default('true'),
  SEED_ON_START: Joi.string().valid('true', 'false').default('false'),
});
