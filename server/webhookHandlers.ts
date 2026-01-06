import { getStripeSync } from './stripeClient';
import { db } from './db';
import { users } from '@shared/schema';
import { eq } from 'drizzle-orm';

export class WebhookHandlers {
  static async processWebhook(payload: Buffer, signature: string): Promise<void> {
    if (!Buffer.isBuffer(payload)) {
      throw new Error(
        'STRIPE WEBHOOK ERROR: Payload must be a Buffer. ' +
        'Received type: ' + typeof payload + '. ' +
        'This usually means express.json() parsed the body before reaching this handler. ' +
        'FIX: Ensure webhook route is registered BEFORE app.use(express.json()).'
      );
    }

    const sync = await getStripeSync();
    const event = await sync.processWebhook(payload, signature);

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as any;
      
      if (session.payment_status === 'paid' && session.mode === 'payment') {
        const customerId = session.customer as string;
        const userId = session.metadata?.userId as string;
        
        let updated = false;

        if (userId) {
          const result = await db
            .update(users)
            .set({ isPremium: true, updatedAt: new Date() })
            .where(eq(users.id, userId))
            .returning();
          
          if (result.length > 0) {
            console.log(`User ${userId} upgraded to Premium via metadata`);
            updated = true;
          }
        }
        
        if (!updated && customerId) {
          const result = await db
            .update(users)
            .set({ isPremium: true, updatedAt: new Date() })
            .where(eq(users.stripeCustomerId, customerId))
            .returning();
          
          if (result.length > 0) {
            console.log(`User with Stripe customer ${customerId} upgraded to Premium`);
            updated = true;
          }
        }

        if (!updated) {
          console.warn(`Could not find user to upgrade: customerId=${customerId}, userId=${userId}`);
        }
      }
    }
  }
}
