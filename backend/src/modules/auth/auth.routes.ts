import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../utils/asyncHandler';
import { validate } from '../../middleware/validate';
import { requireAuth } from '../../middleware/auth';
import { loginLimiter } from '../../middleware/rateLimit';
import { changePassword, getProfile, login, logout, refreshSession, registerOwner } from './auth.service';
import { requestCode, verifyCode } from './otp.service';

export const authRouter = Router();

const passwordSchema = z.string().min(8, 'Use at least 8 characters').max(72);

authRouter.post(
  '/register',
  loginLimiter,
  validate({
    body: z.object({
      restaurantName: z.string().min(2).max(80),
      name: z.string().min(2).max(80),
      email: z.string().email().optional(),
      phone: z.string().min(8).max(15).optional(),
      password: passwordSchema,
      cuisine: z.string().max(60).optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const result = await registerOwner(req.body);
    res.status(201).json(result);
  }),
);

authRouter.post(
  '/login',
  loginLimiter,
  validate({
    body: z.object({
      identifier: z.string().min(3, 'Enter your email or phone number'),
      password: z.string().min(1, 'Enter your password'),
    }),
  }),
  asyncHandler(async (req, res) => {
    const result = await login(req.body.identifier, req.body.password);
    res.json(result);
  }),
);

/**
 * The floor signs in with the phone number they gave on the job form plus a code that is worth
 * five minutes. Nobody has to be handed a password to start a shift.
 */
authRouter.post(
  '/otp/request',
  loginLimiter,
  validate({ body: z.object({ phone: z.string().min(8).max(20) }) }),
  asyncHandler(async (req, res) => {
    const { requested, code } = await requestCode(req.body.phone);
    // A number we will not text answers the same way as one that does not exist here.
    res.json({ ok: true, sent: requested, demoCode: code });
  }),
);

authRouter.post(
  '/otp/verify',
  loginLimiter,
  validate({
    body: z.object({
      phone: z.string().min(8).max(20),
      code: z.string().regex(/^\d{4,8}$/, 'Enter the digits from the code'),
    }),
  }),
  asyncHandler(async (req, res) => {
    res.json(await verifyCode(req.body.phone, req.body.code));
  }),
);

authRouter.post(
  '/refresh',
  validate({ body: z.object({ refreshToken: z.string().min(10) }) }),
  asyncHandler(async (req, res) => {
    const result = await refreshSession(req.body.refreshToken);
    res.json(result);
  }),
);

authRouter.post(
  '/logout',
  requireAuth,
  asyncHandler(async (req, res) => {
    await logout(req.auth!.userId);
    res.json({ ok: true });
  }),
);

authRouter.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const result = await getProfile(req.auth!.userId);
    res.json(result);
  }),
);

authRouter.post(
  '/change-password',
  requireAuth,
  validate({
    body: z.object({
      currentPassword: z.string().min(1),
      newPassword: passwordSchema,
    }),
  }),
  asyncHandler(async (req, res) => {
    await changePassword(req.auth!.userId, req.body.currentPassword, req.body.newPassword);
    res.json({ ok: true });
  }),
);
