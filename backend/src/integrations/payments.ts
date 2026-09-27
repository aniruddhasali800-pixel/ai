import { env } from '../config/env';
import { hmacHex, randomToken } from '../utils/tokens';
import type { PaymentMethod } from '../types/constants';

export interface PaymentIntent {
  providerOrderId: string;
  checkoutUrl: string | null;
  meta?: Record<string, unknown>;
}

export interface PaymentGateway {
  id: string;
  createIntent(opts: {
    amount: number;
    currency: string;
    reference: string;
    method: PaymentMethod;
    notes?: string;
  }): Promise<PaymentIntent>;
  refund(opts: { providerPaymentId: string; amount: number; reason?: string }): Promise<{ providerRefundId: string }>;
  verifyWebhook(rawBody: string, signature: string): boolean;
}

/** Development gateway: intents are created instantly and webhooks are HMAC-signed. */
const mockGateway: PaymentGateway = {
  id: 'MOCK',
  async createIntent({ amount, reference, method }) {
    const providerOrderId = `mock_${randomToken(10)}`;
    return {
      providerOrderId,
      checkoutUrl: `${env.PUBLIC_BASE_URL}/pay/mock?ref=${encodeURIComponent(reference)}&amount=${amount}&method=${method}`,
      meta: { method, sandbox: true },
    };
  },
  async refund({ amount }) {
    return { providerRefundId: `mockrf_${randomToken(8)}_${Math.round(amount * 100)}` };
  },
  verifyWebhook(rawBody, signature) {
    return hmacHex(env.PAYMENT_WEBHOOK_SECRET, rawBody) === signature;
  },
};

/**
 * Razorpay adapter — activates automatically when API keys are present.
 * Webhook verification follows Razorpay's documented HMAC-SHA256 scheme.
 */
const razorpayGateway: PaymentGateway = {
  id: 'RAZORPAY',
  async createIntent({ amount, currency, reference, notes }) {
    const auth = Buffer.from(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`).toString('base64');
    const res = await fetch('https://api.razorpay.com/v1/payment_links', {
      method: 'POST',
      headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: Math.round(amount * 100),
        currency,
        reference_id: reference,
        description: notes ?? reference,
        callback_url: `${env.PUBLIC_BASE_URL}/pay/return?ref=${encodeURIComponent(reference)}`,
        callback_method: 'get',
      }),
    });
    if (!res.ok) throw new Error(`Razorpay intent failed: ${res.status}`);
    const body = (await res.json()) as { id: string; short_url?: string };
    return { providerOrderId: body.id, checkoutUrl: body.short_url ?? null, meta: { gateway: 'razorpay' } };
  },
  async refund({ providerPaymentId, amount }) {
    const auth = Buffer.from(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`).toString('base64');
    const res = await fetch(`https://api.razorpay.com/v1/payments/${providerPaymentId}/refund`, {
      method: 'POST',
      headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: Math.round(amount * 100) }),
    });
    if (!res.ok) throw new Error(`Razorpay refund failed: ${res.status}`);
    const body = (await res.json()) as { id: string };
    return { providerRefundId: body.id };
  },
  verifyWebhook(rawBody, signature) {
    const secret = env.RAZORPAY_WEBHOOK_SECRET;
    if (!secret) return false;
    return hmacHex(secret, rawBody) === signature;
  },
};

export function gatewayFor(provider: string): PaymentGateway | null {
  if (provider === 'RAZORPAY' && env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET) return razorpayGateway;
  if (provider === 'MOCK' || provider === 'RAZORPAY') return mockGateway;
  return null;
}

export function onlineGateway(): PaymentGateway {
  if (env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET) return razorpayGateway;
  return mockGateway;
}
