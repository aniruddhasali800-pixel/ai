import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  MONGODB_URI: z.string().trim().optional(),
  ACCESS_TOKEN_SECRET: z.string().min(16).default('dev-access-secret-0000000000'),
  REFRESH_TOKEN_SECRET: z.string().min(16).default('dev-refresh-secret-0000000000'),
  ACCESS_TOKEN_TTL: z.string().default('15m'),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().default(7),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  PUBLIC_BASE_URL: z.string().default('http://localhost:5173'),
  PAYMENT_WEBHOOK_SECRET: z.string().default('dev-webhook-secret'),
  SWIGGY_WEBHOOK_SECRET: z.string().default('dev-swiggy-secret'),
  ZOMATO_WEBHOOK_SECRET: z.string().default('dev-zomato-secret'),
  WEBSITE_WEBHOOK_SECRET: z.string().default('dev-website-secret'),
  SWIGGY_API_BASE: z.string().optional(),
  SWIGGY_API_KEY: z.string().optional(),
  ZOMATO_API_BASE: z.string().optional(),
  ZOMATO_API_KEY: z.string().optional(),
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional(),
  UPLOAD_DIR: z.string().default('uploads'),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = {
  ...parsed.data,
  isProd: parsed.data.NODE_ENV === 'production',
  isTest: parsed.data.NODE_ENV === 'test',
};
