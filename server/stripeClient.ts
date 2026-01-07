import Stripe from 'stripe';

let stripeClient: Stripe | null = null;

export function getStripeClient(): Stripe {
  if (!stripeClient) {
    const secretKey = process.env.STRIPE_SECRET_KEY;
    
    if (!secretKey) {
      throw new Error('STRIPE_SECRET_KEY is not configured in environment secrets');
    }
    
    const keyPrefix = secretKey.substring(0, 12);
    const keySuffix = secretKey.substring(secretKey.length - 4);
    console.log(`Stripe key loaded: ${keyPrefix}...${keySuffix}`);
    
    if (!secretKey.startsWith('sk_live_')) {
      console.warn('WARNING: Stripe key does not appear to be a LIVE key');
    }
    
    stripeClient = new Stripe(secretKey);
  }
  
  return stripeClient;
}

export async function getUncachableStripeClient(): Promise<Stripe> {
  return getStripeClient();
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

let stripeSync: any = null;

export async function getStripeSync() {
  if (!stripeSync) {
    const { StripeSync } = await import('stripe-replit-sync');
    const secretKey = process.env.STRIPE_SECRET_KEY;
    
    if (!secretKey) {
      throw new Error('STRIPE_SECRET_KEY is not configured');
    }
    
    const keyPrefix = secretKey.substring(0, 12);
    const keySuffix = secretKey.substring(secretKey.length - 4);
    console.log(`StripeSync using key: ${keyPrefix}...${keySuffix}`);

    stripeSync = new StripeSync({
      poolConfig: {
        connectionString: process.env.DATABASE_URL!,
        max: 2,
      },
      stripeSecretKey: secretKey,
    });
  }
  return stripeSync;
}
