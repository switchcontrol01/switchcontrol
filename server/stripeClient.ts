import Stripe from 'stripe';

console.log("Stripe key prefix:", process.env.STRIPE_SECRET_KEY?.slice(0, 7));
console.log("Has STRIPE_LIVE_KEY:", Boolean(process.env.STRIPE_LIVE_KEY));

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export function isTestMode(): boolean {
  return process.env.STRIPE_SECRET_KEY?.startsWith('sk_test_') ?? false;
}

export function getStripeClient(): Stripe {
  return stripe;
}

export async function getUncachableStripeClient(): Promise<Stripe> {
  return stripe;
}

export function getStripePublishableKey(): string {
  const publishableKey = process.env.STRIPE_PUBLISHABLE_KEY;
  if (!publishableKey) {
    throw new Error('STRIPE_PUBLISHABLE_KEY is not configured');
  }
  return publishableKey;
}

export async function getStripeSecretKey(): Promise<string> {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error('STRIPE_SECRET_KEY is not configured');
  }
  return secretKey;
}

export function getWebhookSecret(): string | undefined {
  return process.env.STRIPE_WEBHOOK_SECRET;
}
