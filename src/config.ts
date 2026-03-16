import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envBoolean = z.preprocess((value) => {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') {
      return true;
    }

    if (normalized === 'false') {
      return false;
    }
  }

  return value;
}, z.boolean());

const envSchema = z.object({
  OPENINC_PUSH_NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  OPENINC_PUSH_PORT: z.coerce.number().int().positive().default(3000),
  OPENINC_PUSH_MONGODB_URI: z.string().min(1),
  OPENINC_PUSH_MONGODB_DB_NAME: z.string().min(1),
  OPENINC_PUSH_MONGODB_COLLECTION_PREFIX: z.string().min(1).default('openinc_push_'),
  OPENINC_PUSH_LOG_LEVEL: z.string().default('info'),
  OPENINC_PUSH_API_KEY_SALT: z.string().min(8),
  OPENINC_PUSH_DEFAULT_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(20).default(5),
  OPENINC_PUSH_WORKER_POLL_INTERVAL_MS: z.coerce.number().int().min(100).default(2000),
  OPENINC_PUSH_WORKER_BATCH_SIZE: z.coerce.number().int().min(1).max(100).default(10),
  OPENINC_PUSH_WORKER_LEASE_MS: z.coerce.number().int().min(1000).default(30000),
  OPENINC_PUSH_ENCRYPTION_KEY_BASE64: z.string().min(1),
  OPENINC_PUSH_WEB_PUSH_VAPID_SUBJECT: z.string().default('mailto:ops@example.com'),
  OPENINC_PUSH_WEB_PUSH_VAPID_PUBLIC_KEY: z.string().optional(),
  OPENINC_PUSH_WEB_PUSH_VAPID_PRIVATE_KEY: z.string().optional(),
  OPENINC_PUSH_FCM_SERVICE_ACCOUNT_JSON: z.string().optional(),
  OPENINC_PUSH_APNS_KEY_PATH: z.string().optional(),
  OPENINC_PUSH_APNS_KEY_ID: z.string().optional(),
  OPENINC_PUSH_APNS_TEAM_ID: z.string().optional(),
  OPENINC_PUSH_APNS_TOPIC: z.string().optional(),
  OPENINC_PUSH_APNS_PRODUCTION: envBoolean.default(false),
  OPENINC_PUSH_SMTP_HOST: z.string().optional(),
  OPENINC_PUSH_SMTP_PORT: z.coerce.number().int().positive().optional(),
  OPENINC_PUSH_SMTP_SECURE: envBoolean.default(false),
  OPENINC_PUSH_SMTP_USER: z.string().optional(),
  OPENINC_PUSH_SMTP_PASS: z.string().optional(),
  OPENINC_PUSH_SMTP_FROM: z.string().optional(),
  OPENINC_PUSH_BOOTSTRAP_CLIENT_APP_NAME: z.string().optional(),
  OPENINC_PUSH_BOOTSTRAP_CLIENT_APP_API_KEY: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  throw new Error(`Invalid environment configuration: ${parsed.error.message}`);
}

const env = parsed.data;

export const config = {
  NODE_ENV: env.OPENINC_PUSH_NODE_ENV,
  PORT: env.OPENINC_PUSH_PORT,
  MONGODB_URI: env.OPENINC_PUSH_MONGODB_URI,
  MONGODB_DB_NAME: env.OPENINC_PUSH_MONGODB_DB_NAME,
  MONGODB_COLLECTION_PREFIX: env.OPENINC_PUSH_MONGODB_COLLECTION_PREFIX,
  LOG_LEVEL: env.OPENINC_PUSH_LOG_LEVEL,
  API_KEY_SALT: env.OPENINC_PUSH_API_KEY_SALT,
  DEFAULT_MAX_ATTEMPTS: env.OPENINC_PUSH_DEFAULT_MAX_ATTEMPTS,
  WORKER_POLL_INTERVAL_MS: env.OPENINC_PUSH_WORKER_POLL_INTERVAL_MS,
  WORKER_BATCH_SIZE: env.OPENINC_PUSH_WORKER_BATCH_SIZE,
  WORKER_LEASE_MS: env.OPENINC_PUSH_WORKER_LEASE_MS,
  ENCRYPTION_KEY_BASE64: env.OPENINC_PUSH_ENCRYPTION_KEY_BASE64,
  WEB_PUSH_VAPID_SUBJECT: env.OPENINC_PUSH_WEB_PUSH_VAPID_SUBJECT,
  WEB_PUSH_VAPID_PUBLIC_KEY: env.OPENINC_PUSH_WEB_PUSH_VAPID_PUBLIC_KEY,
  WEB_PUSH_VAPID_PRIVATE_KEY: env.OPENINC_PUSH_WEB_PUSH_VAPID_PRIVATE_KEY,
  FCM_SERVICE_ACCOUNT_JSON: env.OPENINC_PUSH_FCM_SERVICE_ACCOUNT_JSON,
  APNS_KEY_PATH: env.OPENINC_PUSH_APNS_KEY_PATH,
  APNS_KEY_ID: env.OPENINC_PUSH_APNS_KEY_ID,
  APNS_TEAM_ID: env.OPENINC_PUSH_APNS_TEAM_ID,
  APNS_TOPIC: env.OPENINC_PUSH_APNS_TOPIC,
  APNS_PRODUCTION: env.OPENINC_PUSH_APNS_PRODUCTION,
  SMTP_HOST: env.OPENINC_PUSH_SMTP_HOST,
  SMTP_PORT: env.OPENINC_PUSH_SMTP_PORT,
  SMTP_SECURE: env.OPENINC_PUSH_SMTP_SECURE,
  SMTP_USER: env.OPENINC_PUSH_SMTP_USER,
  SMTP_PASS: env.OPENINC_PUSH_SMTP_PASS,
  SMTP_FROM: env.OPENINC_PUSH_SMTP_FROM,
  BOOTSTRAP_CLIENT_APP_NAME: env.OPENINC_PUSH_BOOTSTRAP_CLIENT_APP_NAME,
  BOOTSTRAP_CLIENT_APP_API_KEY: env.OPENINC_PUSH_BOOTSTRAP_CLIENT_APP_API_KEY,
} as const;
