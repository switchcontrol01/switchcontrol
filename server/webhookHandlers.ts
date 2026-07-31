import Stripe from 'stripe';
import { getStripeClient, getWebhookSecret } from './stripeClient';
import { db } from './db';
import { users, stripeWebhookEvents } from '@shared/schema';
import { eq, sql as drizzleSql } from 'drizzle-orm';
import { tryClaimEvent } from './lib/stripeEventStore';
import { storage } from './storage';

const isProd = process.env.NODE_ENV === 'production';

export class WebhookHandlers {
  static async processWebhook(payload: Buffer, signature: string): Promise<void> {
    if (!Buffer.isBuffer(payload)) {
      throw new Error(
        '[Stripe] Webhook payload must be a Buffer. ' +
        'Received: ' + typeof payload + '. ' +
        'Ensure the webhook route is registered BEFORE app.use(express.json()).'
      );
    }

    const stripe = getStripeClient();
    const webhookSecret = getWebhookSecret();

    if (!webhookSecret) {
      if (isProd) {
        // Hard-fail in production — unsigned events are never acceptable with real money.
        throw new Error('[Stripe] STRIPE_WEBHOOK_SECRET is required in production. Rejecting unsigned webhook.');
      }
      // Dev/test only — proceed without verification, but make the risk visible.
      console.warn('[Stripe] WARNING: STRIPE_WEBHOOK_SECRET not set. Webhook signature verification skipped. This is only acceptable in development.');
    }

    let event: Stripe.Event;

    if (webhookSecret) {
      try {
        event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
        console.log(`[Stripe] Webhook signature verified: type=${event.type} id=${event.id}`);
      } catch (err: any) {
        console.error(`[Stripe] Webhook signature verification FAILED: ${err.message}`);
        throw err;
      }
    } else {
      event = JSON.parse(payload.toString()) as Stripe.Event;
      console.warn(`[Stripe] Webhook parsed WITHOUT signature verification: type=${event.type} id=${event.id}`);
    }

    // Persist every webhook event for admin visibility (async, non-blocking)
    try {
      await storage.addStripeWebhookEvent({
        eventId: event.id,
        eventType: event.type,
        payload: event as any,
      });
    } catch (err: any) {
      console.warn(`[Stripe] Failed to persist webhook event to DB: ${err.message}`);
    }

    // ── Atomic idempotency claim ───────────────────────────────────────────────
    // The INSERT is the gate. Doing it here, before any side effects, eliminates
    // the TOCTOU gap of SELECT-then-INSERT: two concurrent deliveries of the same
    // event both pass a SELECT before either commits; the unique-constraint INSERT
    // means only one wins the race. Covers all event types uniformly.
    const claimed = await tryClaimEvent(event.id);
    if (!claimed) {
      console.log(`[Stripe] Duplicate event ignored (already processed): type=${event.type} id=${event.id}`);
      return;
    }

    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(event);
        break;
      case 'charge.refunded':
        await handleChargeRefunded(event);
        break;
      case 'charge.dispute.created':
        await handleChargeDisputeCreated(event);
        break;
      default:
        console.log(`[Stripe] Unhandled event type: ${event.type} id=${event.id}`);
    }
  }
}

async function handleCheckoutCompleted(event: Stripe.Event): Promise<void> {
  const eventId = event.id;
  const session = event.data.object as Stripe.Checkout.Session;
  const sessionId = session.id;

  // Event is already claimed atomically by tryClaimEvent() in processWebhook.
  console.log(`[Stripe] Processing checkout.session.completed: event=${eventId} session=${sessionId}`);

  // ── 1. Verify payment status ──────────────────────────────────────────────
  if (session.payment_status !== 'paid') {
    console.log(`[Stripe] Session ${sessionId} payment_status=${session.payment_status} — not paid, skipping premium grant`);
    return;
  }

  if (session.mode !== 'payment') {
    console.log(`[Stripe] Session ${sessionId} mode=${session.mode} — not a one-time payment, skipping`);
    return;
  }

  // ── 3. Validate purchased price against STRIPE_PREMIUM_PRICE_ID ───────────
  const expectedPriceId = process.env.STRIPE_PREMIUM_PRICE_ID;
  if (!expectedPriceId) {
    // Cannot validate without the expected price ID — fail hard so this is caught immediately.
    console.error('[Stripe] STRIPE_PREMIUM_PRICE_ID is not configured — cannot validate purchase. Premium NOT granted.');
    throw new Error('[Stripe] STRIPE_PREMIUM_PRICE_ID missing. Configure it before processing live payments.');
  }

  const stripe = getStripeClient();
  let priceMatched = false;

  try {
    const lineItems = await stripe.checkout.sessions.listLineItems(sessionId, { limit: 10 });
    // Require the session to contain EXACTLY ONE line item and have it be the
    // expected premium price.  Checking `.some()` alone would pass a session
    // that bundles the premium price alongside any other item (e.g. a $0.01
    // add-on), which could be exploited if a client-side checkout call ever
    // allows multi-item sessions.  Strict single-item enforcement closes this.
    priceMatched =
      lineItems.data.length === 1 &&
      lineItems.data[0].price?.id === expectedPriceId;
    const purchasedIds = lineItems.data.map((i) => i.price?.id).join(', ');
    console.log(
      `[Stripe] Session ${sessionId} line items: [${purchasedIds}] (count=${lineItems.data.length}) ` +
      `— expected: ${expectedPriceId} — matched: ${priceMatched}`,
    );
  } catch (err: any) {
    console.error(`[Stripe] Failed to retrieve line items for session ${sessionId}: ${err.message}`);
    throw err;
  }

  if (!priceMatched) {
    // Event is already claimed — Stripe won't retry it.
    console.warn(`[Stripe] Session ${sessionId} does not contain expected premium price ID ${expectedPriceId}. Premium NOT granted. (event=${eventId})`);
    return;
  }

  // ── 4. Resolve the user ───────────────────────────────────────────────────
  const userId = session.metadata?.userId as string | undefined;
  const customerId = session.customer as string | undefined;
  const clientRef = session.client_reference_id as string | undefined;

  const resolvedUserId = userId || clientRef;

  if (!resolvedUserId && !customerId) {
    console.error(`[Stripe] No user mapping in session ${sessionId}: missing metadata.userId, client_reference_id, and customer. Premium NOT granted. (event=${eventId})`);
    return;
  }

  // ── 5. Grant premium ──────────────────────────────────────────────────────
  let granted = false;
  const now = new Date();

  if (resolvedUserId && db) {
    const result = await db
      .update(users)
      .set({
        isPremium: true,
        plan: 'premium',
        premiumActivatedAt: now,
        // Reset animation flags so the premium unlock/tour replay on re-purchase.
        hasSeenPremiumUnlock: false,
        hasSeenPremiumTour: false,
        updatedAt: now,
      })
      .where(eq(users.id, resolvedUserId))
      .returning();

    if (result.length > 0) {
      console.log(`[Stripe] Premium granted to userId=${resolvedUserId} via metadata/client_reference_id (event=${eventId})`);
      granted = true;
    } else {
      console.warn(`[Stripe] metadata userId=${resolvedUserId} not found in users table. Trying customerId fallback. (event=${eventId})`);
    }
  }

  if (!granted && customerId && db) {
    const result = await db
      .update(users)
      .set({
        isPremium: true,
        plan: 'premium',
        premiumActivatedAt: now,
        hasSeenPremiumUnlock: false,
        hasSeenPremiumTour: false,
        updatedAt: now,
      })
      .where(eq(users.stripeCustomerId, customerId))
      .returning();

    if (result.length > 0) {
      console.log(`[Stripe] Premium granted via stripeCustomerId fallback: customerId=${customerId} (event=${eventId})`);
      granted = true;
    }
  }

  if (!granted) {
    console.error(`[Stripe] Could not resolve user to grant premium: userId=${resolvedUserId} customerId=${customerId} (event=${eventId}). Manual review required.`);
    // Flag the persisted webhook row so admins can query for unresolved payments.
    // Without this the only trace is the console.error above — a paying customer
    // who received nothing would require manual log-grepping to discover.
    // We embed the flag in the JSONB payload column (no schema change needed).
    if (db) {
      try {
        await db.update(stripeWebhookEvents)
          .set({
            payload: drizzleSql`${stripeWebhookEvents.payload} || '{"_needsManualReview":true,"_grantFailureReason":"Could not resolve userId or stripeCustomerId to any user row — premium not granted"}'::jsonb`,
          })
          .where(eq(stripeWebhookEvents.eventId, eventId));
        console.error(`[Stripe] Event ${eventId} flagged _needsManualReview=true in stripe_webhook_events. Query: SELECT * FROM stripe_webhook_events WHERE payload->>'_needsManualReview' = 'true';`);
      } catch (flagErr: any) {
        console.error(`[Stripe] Could not write _needsManualReview flag for event ${eventId}: ${flagErr.message}`);
      }
    }
  }

  // Event already claimed atomically in processWebhook — no markEventProcessed needed here.
  console.log(`[Stripe] checkout.session.completed processing complete: id=${eventId} granted=${granted}`);
}

// ── Refund handler: revoke premium on full refund ───────────────────────────
async function handleChargeRefunded(event: Stripe.Event): Promise<void> {
  const eventId = event.id;
  const charge = event.data.object as Stripe.Charge;

  console.log(`[Stripe] Processing charge.refunded: event=${eventId} charge=${charge.id} refunded=${charge.refunded} amount_refunded=${charge.amount_refunded}`);

  // Only act on full refunds (amount_refunded === amount)
  if (!charge.refunded || charge.amount_refunded !== charge.amount) {
    console.log(`[Stripe] Partial or non-refund charge — skipping premium revocation. charge=${charge.id}`);
    return;
  }

  const customerId = charge.customer as string | undefined;
  if (!customerId) {
    console.log(`[Stripe] No customer on charge ${charge.id} — cannot revoke premium.`);
    return;
  }

  if (!db) {
    console.warn(`[Stripe] DB unavailable — cannot revoke premium for customer ${customerId}`);
    return;
  }

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.stripeCustomerId, customerId))
    .limit(1);

  if (!user) {
    console.log(`[Stripe] No user found for customer ${customerId} — nothing to revoke.`);
    return;
  }

  if (!user.isPremium && user.plan !== 'premium') {
    console.log(`[Stripe] User ${user.id} is not premium — nothing to revoke.`);
    return;
  }

  await db
    .update(users)
    .set({
      isPremium: false,
      plan: 'free',
      premiumActivatedAt: null,
      updatedAt: new Date(),
    })
    .where(eq(users.id, user.id));

  console.log(`[Stripe] Premium REVOKED for user ${user.id} due to full refund on charge ${charge.id} (event=${eventId})`);
}

// ── Dispute handler: revoke premium when a dispute is opened ────────────────
async function handleChargeDisputeCreated(event: Stripe.Event): Promise<void> {
  const eventId = event.id;
  const dispute = event.data.object as Stripe.Dispute;

  console.log(`[Stripe] Processing charge.dispute.created: event=${eventId} dispute=${dispute.id} charge=${dispute.charge}`);

  const chargeId = typeof dispute.charge === 'string' ? dispute.charge : dispute.charge?.id;
  if (!chargeId) {
    console.log(`[Stripe] No charge ID on dispute ${dispute.id} — cannot revoke premium.`);
    return;
  }

  if (!db) {
    console.warn(`[Stripe] DB unavailable — cannot revoke premium for dispute ${dispute.id}`);
    return;
  }

  // We need the charge to find the customer; fetch it via Stripe API
  const stripe = getStripeClient();
  let customerId: string | undefined;
  try {
    const charge = await stripe.charges.retrieve(chargeId);
    customerId = charge.customer as string | undefined;
  } catch (err: any) {
    console.error(`[Stripe] Failed to retrieve charge ${chargeId} for dispute: ${err.message}`);
    return;
  }

  if (!customerId) {
    console.log(`[Stripe] No customer on charge ${chargeId} — cannot revoke premium.`);
    return;
  }

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.stripeCustomerId, customerId))
    .limit(1);

  if (!user) {
    console.log(`[Stripe] No user found for customer ${customerId} — nothing to revoke.`);
    return;
  }

  if (!user.isPremium && user.plan !== 'premium') {
    console.log(`[Stripe] User ${user.id} is not premium — nothing to revoke.`);
    return;
  }

  await db
    .update(users)
    .set({
      isPremium: false,
      plan: 'free',
      premiumActivatedAt: null,
      updatedAt: new Date(),
    })
    .where(eq(users.id, user.id));

  console.log(`[Stripe] Premium REVOKED for user ${user.id} due to dispute ${dispute.id} on charge ${chargeId} (event=${eventId})`);
}
