import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { handleGatewayWebhook } from './payments.webhook';

/**
 * Mounted before the JSON body parser so the raw payload bytes stay intact
 * for HMAC verification. No auth — the signature is the authentication.
 */
export const paymentWebhookRouter = Router();

paymentWebhookRouter.post(
  '/:provider',
  asyncHandler(async (req, res) => {
    const rawBody = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : JSON.stringify(req.body ?? {});
    const signature = String(
      req.headers['x-razorpay-signature'] ?? req.headers['x-signature'] ?? req.headers['x-payment-signature'] ?? '',
    );
    const result = await handleGatewayWebhook(req.params.provider, rawBody, signature);
    res.status(result.ok ? 200 : result.status ?? 400).json({ ok: result.ok, message: result.message });
  }),
);
