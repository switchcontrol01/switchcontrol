import Stripe from 'stripe';

const isProd = process.env.NODE_ENV === 'production';

// Read at startup for compatibility with isStripeConfigured and isTestMode,
// but all API calls must use getUncachableStripeClient() which reads live from env.
const stripeSecretKeyAtBoot = process.env.STRIPE_SECRET_KEY;

export const isStripeConfigured = !!stripeSecretKeyAtBoot;

// Singleton used by getStripeClient() (startup/webhook verification only).
let stripe: Stripe | null = null;
if (stripeSecretKeyAtBoot) {
  stripe = new Stripe(stripeSecretKeyAtBoot);
} else {
  console.warn('[Stripe] Disabled — STRIPE_SECRET_KEY not set. Billing features will be unavailable.');
}

/**
 * Returns true if the Stripe secret key (at boot time) is a test-mode key.
 */
export function isTestMode(): boolean {
  return (process.env.STRIPE_SECRET_KEY ?? stripeSecretKeyAtBoot)?.startsWith('sk_test_') ?? true;
}

/**
 * Returns the cached Stripe client initialised at boot.
 * Use only for startup checks and webhook signature verification.
 * For all user-triggered API calls, use getUncachableStripeClient().
 */
export function getStripeClient(): Stripe {
  if (!stripe) {
    throw new Error('[Stripe] Not configured. Set STRIPE_SECRET_KEY.');
  }
  return stripe;
}

/**
 * Creates a fresh Stripe instance from the CURRENT value of STRIPE_SECRET_KEY.
 * This means updating the secret in the environment takes effect on the very
 * next request without requiring a server restart.
 */
export async function getUncachableStripeClient(): Promise<Stripe> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error('[Stripe] STRIPE_SECRET_KEY is not set — cannot make Stripe API calls.');
  }
  return new Stripe(key);
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
  const currentKey = process.env.STRIPE_SECRET_KEY;
  if (!currentKey) {
    console.warn('[Stripe] Billing NOT configured (STRIPE_SECRET_KEY missing).');
    return;
  }

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
