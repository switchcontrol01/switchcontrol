import Stripe from 'stripe';

const isProd = process.env.NODE_ENV === 'production';
const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

export const isStripeConfigured = !!stripeSecretKey;

let stripe: Stripe | null = null;

if (stripeSecretKey) {
  stripe = new Stripe(stripeSecretKey);
} else {
  console.warn('[Stripe] Disabled — STRIPE_SECRET_KEY not set. Billing features will be unavailable.');
}

/**
 * Returns true if the Stripe secret key is a test-mode key.
 * Safe to call even when Stripe is not configured.
 */
export function isTestMode(): boolean {
  return stripeSecretKey?.startsWith('sk_test_') ?? true;
}

/**
 * Returns the Stripe client. Throws if not configured.
 */
export function getStripeClient(): Stripe {
  if (!stripe) {
    throw new Error('[Stripe] Not configured. Set STRIPE_SECRET_KEY.');
  }
  return stripe;
}

/**
 * Alias kept for compatibility — same as getStripeClient().
 */
export async function getUncachableStripeClient(): Promise<Stripe> {
  return getStripeClient();
}

/**
 * Returns the publishable key. Throws if not configured.
 */
export function getStripePublishableKey(): string {
  const key = process.env.STRIPE_PUBLISHABLE_KEY;
  if (!key) {
    throw new Error('[Stripe] STRIPE_PUBLISHABLE_KEY is not configured.');
  }
  return key;
}

/**
 * Returns the webhook signing secret.
 * In production, throws if the secret is missing — unsigned webhooks are never
 * acceptable with real money.
 */
export function getWebhookSecret(): string | undefined {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret && isProd) {
    throw new Error('[Stripe] STRIPE_WEBHOOK_SECRET is required in production. Refusing to process webhooks without signature verification.');
  }
  return secret;
}

/**
 * Logs the current Stripe billing configuration state at startup.
 * Never leaks key values.
 */
export function logStripeStartupConfig(): void {
  if (!isStripeConfigured) {
    console.warn('[Stripe] Billing NOT configured (STRIPE_SECRET_KEY missing).');
    return;
  }

  const mode = isTestMode() ? 'TEST' : 'LIVE';
  const hasPublishableKey = !!process.env.STRIPE_PUBLISHABLE_KEY;
  const hasWebhookSecret = !!process.env.STRIPE_WEBHOOK_SECRET;
  const hasPriceId = !!process.env.STRIPE_PREMIUM_PRICE_ID;

  console.log(`[Stripe] Config check — publishableKey=${hasPublishableKey} webhookSecret=${hasWebhookSecret} priceId=${hasPriceId}`);

  if (!hasPublishableKey) console.warn('[Stripe] STRIPE_PUBLISHABLE_KEY missing — checkout page will fail.');
  if (!hasWebhookSecret && isProd) console.error('[Stripe] STRIPE_WEBHOOK_SECRET missing in production — webhooks will be rejected.');
  if (!hasPriceId) console.error('[Stripe] STRIPE_PREMIUM_PRICE_ID missing — checkout session creation will fail.');

  if (!isTestMode() && isProd) {
    console.log('[Stripe] Running in LIVE mode with production keys.');
  } else if (isTestMode() && isProd) {
    console.warn('[Stripe] WARNING: Test-mode key detected in production environment. Switch to live keys before accepting real payments.');
  }
}
