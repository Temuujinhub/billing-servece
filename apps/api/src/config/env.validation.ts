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
  // Comma-separated emails that get platform-admin access on login.
  ADMIN_EMAILS: Joi.string().allow('').default(''),

  // --- Payment provider selection (real credentials only via droplet .env) ---
  PAYMENT_PROVIDER: Joi.string().valid('qpay_mock', 'qpay').default('qpay_mock'),
  QPAY_BASE_URL: Joi.string().uri().default('https://merchant.qpay.mn'),
  QPAY_USERNAME: Joi.string().when('PAYMENT_PROVIDER', { is: 'qpay', then: Joi.required(), otherwise: Joi.optional().allow('') }),
  QPAY_PASSWORD: Joi.string().when('PAYMENT_PROVIDER', { is: 'qpay', then: Joi.required(), otherwise: Joi.optional().allow('') }),
  QPAY_INVOICE_CODE: Joi.string().when('PAYMENT_PROVIDER', { is: 'qpay', then: Joi.required(), otherwise: Joi.optional().allow('') }),

  // --- SMS provider selection ---
  SMS_PROVIDER: Joi.string().valid('mock', 'callpro').default('mock'),
  CALLPRO_BASE_URL: Joi.string().uri().default('https://api-text.callpro.mn/v1/sms'),
  CALLPRO_API_KEY: Joi.string().when('SMS_PROVIDER', { is: 'callpro', then: Joi.required(), otherwise: Joi.optional().allow('') }),
  CALLPRO_FROM: Joi.string().when('SMS_PROVIDER', { is: 'callpro', then: Joi.required(), otherwise: Joi.optional().allow('') }),
});
