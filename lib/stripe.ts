import Stripe from 'stripe';

declare global {
  var __snapshotStripe: Stripe | undefined;
}

export function getStripe() {
  const secretKey = process.env.STRIPE_SECRET_KEY;

  if (!secretKey) {
    throw new Error('STRIPE_SECRET_KEY not configured');
  }

  if (!global.__snapshotStripe) {
    global.__snapshotStripe = new Stripe(secretKey);
  }

  return global.__snapshotStripe;
}

export function getStripePriceId() {
  const priceId = process.env.STRIPE_PRICE_ID;

  if (!priceId) {
    throw new Error('STRIPE_PRICE_ID not configured');
  }

  return priceId;
}
