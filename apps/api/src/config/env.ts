import 'dotenv/config';
import { z } from 'zod';

const secretDefault = 'development-only-change-this-secret-before-deploying';
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  API_HOST: z.string().default('0.0.0.0'),
  API_BASE_PATH: z.string().startsWith('/').default('/api/v1'),
  CLIENT_ORIGIN: z.string().url().default('http://localhost:5173'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug']).default('info'),
  MONGODB_URI: z.string().min(1).default('mongodb://127.0.0.1:27017/wardpilot'),
  JWT_ACCESS_SECRET: z.string().min(32).default(secretDefault),
  JWT_REFRESH_SECRET: z.string().min(32).default('development-only-refresh-secret-change-before-deploying'),
  JWT_ACCESS_TTL: z.string().regex(/^\d+[smhd]$/).default('15m'),
  JWT_REFRESH_TTL: z.string().regex(/^\d+[smhd]$/).default('7d'),
});
const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
  throw new Error('Environment validation failed. Check your environment variables.');
}
if (parsed.data.NODE_ENV === 'production' && (parsed.data.JWT_ACCESS_SECRET === secretDefault || parsed.data.JWT_REFRESH_SECRET.startsWith('development-only-'))) {
  throw new Error('Production JWT secrets must be explicitly configured and must not use development defaults.');
}
export const env = parsed.data;
