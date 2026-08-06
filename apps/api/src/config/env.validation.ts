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

  // --- Payment provider selection (real credentials only via droplet .env) ---
  PAYMENT_PROVIDER: Joi.string().valid('qpay_mock', 'qpay', 'bonum').default('qpay_mock'),
  QPAY_BASE_URL: Joi.string().uri().default('https://merchant.qpay.mn'),
  QPAY_USERNAME: Joi.string().when('PAYMENT_PROVIDER', { is: 'qpay', then: Joi.required(), otherwise: Joi.optional().allow('') }),
  QPAY_PASSWORD: Joi.string().when('PAYMENT_PROVIDER', { is: 'qpay', then: Joi.required(), otherwise: Joi.optional().allow('') }),
  QPAY_INVOICE_CODE: Joi.string().when('PAYMENT_PROVIDER', { is: 'qpay', then: Joi.required(), otherwise: Joi.optional().allow('') }),

  // --- Bonum Gateway (psp.bonum.mn; test https://testapi.bonum.mn) ---
  BONUM_BASE_URL: Joi.string().uri().default('https://apis.bonum.mn'),
  BONUM_TERMINAL_ID: Joi.string().when('PAYMENT_PROVIDER', { is: 'bonum', then: Joi.required(), otherwise: Joi.optional().allow('') }),
  BONUM_APP_SECRET: Joi.string().when('PAYMENT_PROVIDER', { is: 'bonum', then: Joi.required(), otherwise: Joi.optional().allow('') }),
  BONUM_CHECKSUM_KEY: Joi.string().when('PAYMENT_PROVIDER', { is: 'bonum', then: Joi.required(), otherwise: Joi.optional().allow('') }),
  BONUM_LANG: Joi.string().valid('mn', 'en').default('mn'),
  // Fallback lifetime of a Bonum checkout link when the API returns no expiry;
  // an expired-link visit auto-regenerates a fresh link (unpaid invoices only).
  BONUM_LINK_TTL_MINUTES: Joi.number().min(5).default(60),

  // --- eBarimt provider: mock | qpay (bundled) | posapi (ТЕГ POS API 3.0 local) ---
  EBARIMT_PROVIDER: Joi.string().valid('mock', 'qpay', 'posapi').default('mock'),
  // Local POS API 3.0 instance (LIME-ээр суулгасан) — NOT the public ТЕГ API.
  VAT_BASE_URL: Joi.string().uri().when('EBARIMT_PROVIDER', { is: 'posapi', then: Joi.required(), otherwise: Joi.optional().allow('') }),
  // Env defaults; tenants override via ebarimtMerchantTin/ebarimtPosNo fields.
  EBARIMT_MERCHANT_TIN: Joi.string().optional().allow(''),
  EBARIMT_POS_NO: Joi.string().optional().allow(''),
  EBARIMT_BRANCH_NO: Joi.string().default('001'),
  EBARIMT_DISTRICT_CODE: Joi.string().default('3505'),
  EBARIMT_CLASSIFICATION_CODE: Joi.string().default('6499999'),

  // --- Email provider (onboarding хүсэлт Bonum/LIME рүү илгээх) ---
  EMAIL_PROVIDER: Joi.string().valid('mock', 'smtp').default('mock'),
  SMTP_HOST: Joi.string().when('EMAIL_PROVIDER', { is: 'smtp', then: Joi.required(), otherwise: Joi.optional().allow('') }),
  SMTP_PORT: Joi.number().default(587),
  SMTP_SECURE: Joi.string().valid('true', 'false').default('false'),
  SMTP_USER: Joi.string().optional().allow(''),
  SMTP_PASS: Joi.string().optional().allow(''),
  EMAIL_FROM: Joi.string().optional().allow(''),
  // Хүлээн авагчид — Bonum sales / LIME support имэйл хаягууд.
  ONBOARDING_BONUM_EMAIL: Joi.string().email().optional().allow(''),
  ONBOARDING_LIME_EMAIL: Joi.string().email().optional().allow(''),

  // --- SMS provider selection ---
  SMS_PROVIDER: Joi.string().valid('mock', 'callpro').default('mock'),
  CALLPRO_BASE_URL: Joi.string().uri().default('https://api-text.callpro.mn/v1/sms'),
  CALLPRO_API_KEY: Joi.string().when('SMS_PROVIDER', { is: 'callpro', then: Joi.required(), otherwise: Joi.optional().allow('') }),
  CALLPRO_FROM: Joi.string().when('SMS_PROVIDER', { is: 'callpro', then: Joi.required(), otherwise: Joi.optional().allow('') }),
});
