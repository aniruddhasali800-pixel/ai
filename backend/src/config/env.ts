import 'dotenv/config';
import { z } from 'zod';

// Render tells a service its own public address through these variables. Reading them
// means the socket handshake allowlist and every QR/guest link point at the host the
// browser is actually on, with nothing to remember to set in the dashboard.
const hosted =
  process.env.RENDER_EXTERNAL_URL?.replace(/\/+$/, '') ||
  (process.env.RENDER_EXTERNAL_HOSTNAME ? `https://${process.env.RENDER_EXTERNAL_HOSTNAME}` : undefined);

const localDev = 'http://localhost:5173';

/**
 * The demo client is deployed on its own host, so the API has to be able to read that
 * origin. A dashboard variable nobody remembers to update is the usual way a deployment
 * silently loses realtime, so these are always allowed, not only the default.
 *
 * The custom domain serves the site and proxies /api here, so it is same-origin and needs
 * no entry for its own traffic; it is listed because QR codes and bill links are printed
 * with it. The old Vercel address stays second: stickers already printed and shortcuts
 * already saved point at it, and a deployed client must keep opening.
 */
const demoClients = ['https://smart.restaurant.aniruddhasali.in', 'https://ai-ecru-kappa-14.vercel.app'];

/**
 * Links a person opens — the table sticker, the guest's bill, the pay page, the booking
 * confirmation — belong on the host that serves pages, not on the API host: this service only
 * answers /api and a Render sleep between requests turns a printed code into an error page.
 * The proxied custom domain serves both the site and /api, so it is the address customers reach.
 */
const publicBase = hosted ? demoClients[0] : localDev;

const builtInOrigins = [hosted, ...demoClients, localDev].filter(Boolean) as string[];

/** A laptop address can never be opened from a customer's phone. */
export function isPrivateAddress(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return (
      host === 'localhost' ||
      host === '0.0.0.0' ||
      host.startsWith('127.') ||
      host.startsWith('10.') ||
      host.startsWith('192.168.') ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host)
    );
  } catch {
    return true;
  }
}

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  MONGODB_URI: z.string().trim().optional(),

  ACCESS_TOKEN_SECRET: z.string().min(16).default('dev-access-secret-0000000000'),
  REFRESH_TOKEN_SECRET: z.string().min(16).default('dev-refresh-secret-0000000000'),
  ACCESS_TOKEN_TTL: z.string().default('15m'),

  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().default(7),
  CORS_ORIGIN: z.string().default(builtInOrigins.join(',')),
  PUBLIC_BASE_URL: z.string().default(publicBase),
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
  STATIC_DIR: z.string().trim().optional(),
  // One password that opens any staff account, so this demo can be walked screen by screen
  // without a list kept beside the keyboard. Set it to an empty string to switch the door off.
  DEMO_MASTER_PASSWORD: z.string().default('Sizzle@Master1'),
  // A virgin database gets the demo tenant loaded into it, which is the only way a
  // hosted instance has anything to show. Set AUTO_SEED=false for a clean install.
  AUTO_SEED: z
    .string()
    .optional()
    .transform((v) => v !== 'false'),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

if (parsed.data.NODE_ENV === 'production') {
  const placeholderSecrets = ['dev-access-secret-0000000000', 'dev-refresh-secret-0000000000'];
  const problems: string[] = [];
  if (!parsed.data.MONGODB_URI) problems.push('MONGODB_URI is not set');
  if (placeholderSecrets.includes(parsed.data.ACCESS_TOKEN_SECRET ?? '')) {
    problems.push('ACCESS_TOKEN_SECRET is still the development default');
  }
  if (placeholderSecrets.includes(parsed.data.REFRESH_TOKEN_SECRET ?? '')) {
    problems.push('REFRESH_TOKEN_SECRET is still the development default');
  }
  if (problems.length) {
    console.error(
      `Refusing to start in production:\n- ${problems.join('\n- ')}\n` +
        'Set these on the host (for Render: Dashboard → Environment). Generate secrets with e.g. `openssl rand -hex 32`.',
    );
    process.exit(1);
  }
}

export const env = {
  ...parsed.data,
  isProd: parsed.data.NODE_ENV === 'production',
  isTest: parsed.data.NODE_ENV === 'test',
};

/** The tenant `npm run seed` loads, and the only one the demo master password opens. */
export const DEMO_TENANT_SLUG = 'saffron-and-smoke';

/**
 * One password that opens every active account in the demo tenant, so the walkthrough can run from
 * the owner's reports to the pass without a list kept beside the keyboard. It is a deliberate hole
 * in a build that has no real money or guest data behind it, so it closes by itself the moment the
 * API runs in production, closes on any host that sets the variable to blank, and reaches no
 * restaurant that onboarded itself for real.
 */
export const DEMO_MASTER_PASSWORD = env.isProd ? '' : env.DEMO_MASTER_PASSWORD;

/**
 * Origins allowed on the HTTP and socket handshakes: whatever the host lists plus this
 * app's own addresses. A deployed service is never a cross-origin risk against its own
 * browser, and a stale CORS_ORIGIN must not be able to lock the known clients out.
 */
export const allowedOrigins = [
  ...new Set([...builtInOrigins, ...env.CORS_ORIGIN.split(',').map((o) => o.trim())].filter(Boolean) as string[]),
];

if (hosted && isPrivateAddress(env.PUBLIC_BASE_URL)) {
  console.warn(
    `[config] PUBLIC_BASE_URL is ${env.PUBLIC_BASE_URL}, which no browser outside this machine can open. ` +
      `Using ${publicBase} for table QR codes, guest bills and booking links instead — clear the variable, ` +
      'or set it to the address your customers reach.',
  );
  env.PUBLIC_BASE_URL = publicBase;
} else if (hosted && env.PUBLIC_BASE_URL !== hosted && !allowedOrigins.includes(env.PUBLIC_BASE_URL)) {
  console.warn(
    `[config] PUBLIC_BASE_URL is ${env.PUBLIC_BASE_URL} while this host serves ${hosted}. ` +
      'Table QR codes, guest bills and booking links will point at the first address — set it to ' +
      'the host your customers can actually reach, or clear the variable to use the deployed client.',
  );
}
