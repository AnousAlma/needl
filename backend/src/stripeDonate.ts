import type { Request, Response } from 'express';
import Stripe from 'stripe';

const MIN_CENTS = 50; // Stripe typical minimum (e.g. $0.50 CAD)
const MAX_CENTS = 1_000_000; // $10,000 cap (safety)

function getSecretKey(): string | undefined {
  return process.env.STRIPE_SECRET_KEY?.trim();
}

export function isStripeDonateConfigured(): boolean {
  return Boolean(getSecretKey());
}

function getStripe(): Stripe {
  const key = getSecretKey();
  if (!key) {
    throw new Error('STRIPE_SECRET_KEY is not set');
  }
  return new Stripe(key);
}

/**
 * Accepts https URLs and custom app schemes (e.g. needl://) for mobile return from Checkout.
 */
export function isAllowedDonateRedirectUrl(url: string): boolean {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  const allow = process.env.DONATE_REDIRECT_ALLOWLIST?.split(',').map((s) => s.trim()).filter(Boolean) ?? [];
  if (allow.length > 0) {
    return allow.some((prefix) => url.startsWith(prefix));
  }
  if (u.protocol === 'https:') return true;
  if (u.protocol === 'http:') return true;
  if (u.protocol === 'exp:') return true;
  if (u.protocol === 'exps:') return true;
  // Custom native schemes (needl://, etc.)
  if (/^[a-z][a-z0-9+.-]*:$/i.test(u.protocol)) return true;
  return false;
}

export async function handleCreateDonationSession(
  uid: string,
  body: unknown,
  res: Response,
): Promise<void> {
  if (!isStripeDonateConfigured()) {
    res.status(503).json({ error: 'Donations are not configured on this server' });
    return;
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    res.status(400).json({ error: 'Expected JSON body' });
    return;
  }
  const o = body as Record<string, unknown>;
  const amountCents = typeof o.amountCents === 'number' && Number.isInteger(o.amountCents) ? o.amountCents : NaN;
  const successUrl = typeof o.successUrl === 'string' ? o.successUrl.trim() : '';
  const cancelUrl = typeof o.cancelUrl === 'string' ? o.cancelUrl.trim() : '';
  if (!Number.isFinite(amountCents) || amountCents < MIN_CENTS || amountCents > MAX_CENTS) {
    res.status(400).json({
      error: `amountCents must be an integer between ${MIN_CENTS} and ${MAX_CENTS}`,
    });
    return;
  }
  if (!successUrl || !cancelUrl || !isAllowedDonateRedirectUrl(successUrl) || !isAllowedDonateRedirectUrl(cancelUrl)) {
    res.status(400).json({ error: 'successUrl and cancelUrl must be allowed redirect URLs' });
    return;
  }

  const currency = (process.env.STRIPE_DONATE_CURRENCY ?? 'cad').trim().toLowerCase() || 'cad';
  const productName = (process.env.STRIPE_DONATE_PRODUCT_NAME ?? 'Support Needl').trim() || 'Support Needl';

  try {
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency,
            product_data: { name: productName },
            unit_amount: amountCents,
          },
          quantity: 1,
        },
      ],
      success_url: `${successUrl}${successUrl.includes('?') ? '&' : '?'}session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancelUrl,
      metadata: { firebaseUid: uid },
      payment_intent_data: {
        metadata: { firebaseUid: uid },
      },
    });
    if (!session.url) {
      res.status(502).json({ error: 'Stripe did not return a checkout URL' });
      return;
    }
    res.json({ url: session.url });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(502).json({ error: msg });
  }
}

export async function handleStripeWebhook(req: Request, res: Response): Promise<void> {
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!secret) {
    res.status(503).json({ error: 'Webhook not configured' });
    return;
  }
  const sig = req.headers['stripe-signature'];
  if (typeof sig !== 'string') {
    res.status(400).send('Missing stripe-signature');
    return;
  }
  let event: Stripe.Event;
  try {
    const stripe = getStripe();
    const raw = req.body;
    if (!Buffer.isBuffer(raw) && typeof raw !== 'string') {
      res.status(400).send('Invalid body');
      return;
    }
    const payload = Buffer.isBuffer(raw) ? raw : Buffer.from(raw, 'utf8');
    event = stripe.webhooks.constructEvent(payload, sig, secret);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(400).send(`Webhook signature: ${msg}`);
    return;
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const uid = session.metadata?.firebaseUid;
    const amount = session.amount_total;
    console.log('[stripe] donation completed', { uid, amount, currency: session.currency });
  }

  res.json({ received: true });
}
