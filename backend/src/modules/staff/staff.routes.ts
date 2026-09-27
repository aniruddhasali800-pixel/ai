import { Router } from 'express';
import { z } from 'zod';
import { UserModel } from '../../models';
import { asyncHandler } from '../../utils/asyncHandler';
import { validate } from '../../middleware/validate';
import { requireAuth } from '../../middleware/auth';
import { requirePermission } from '../../middleware/rbac';
import { ApiError } from '../../utils/httpError';
import { emit, Events } from '../../realtime/emit';
import { hashPassword, publicUser } from '../auth/auth.service';
import { recordAudit } from '../../services/audit.service';
import { ROLES } from '../../types/constants';

export const staffRouter = Router();

staffRouter.use(requireAuth);

const staffRoles = ROLES.filter((role) => role !== 'OWNER') as unknown as [string, ...string[]];

const createSchema = z.object({
  name: z.string().min(2).max(80),
  role: z.enum(staffRoles),
  email: z.string().email().optional(),
  phone: z.string().min(8).max(15).optional(),
  password: z.string().min(8).max(72),
});

staffRouter.get(
  '/',
  requirePermission('staff:read'),
  asyncHandler(async (req, res) => {
    const { role, status, search } = req.query as Record<string, string | undefined>;
    const query: Record<string, unknown> = { restaurantId: req.auth!.restaurantId };
    if (role) query.role = role;
    if (status) query.status = status;
    if (search) {
      const rx = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      query.$or = [{ name: rx }, { email: rx }, { phone: rx }];
    }
    const users = await UserModel.find(query).sort({ role: 1, name: 1 }).lean();
    res.json({ data: users.map(publicUser) });
  }),
);

staffRouter.post(
  '/',
  requirePermission('staff:write'),
  validate({ body: createSchema }),
  asyncHandler(async (req, res) => {
    const { name, role, email, phone, password } = req.body;
    if (!email && !phone) throw ApiError.badRequest('Add an email or phone number for this staff member');

    const clash = await UserModel.findOne({
      $or: [...(email ? [{ email: email.toLowerCase() }] : []), ...(phone ? [{ phone }] : [])],
    }).lean();
    if (clash) throw ApiError.conflict('Someone with those details already exists');

    const user = await UserModel.create({
      restaurantId: req.auth!.restaurantId,
      role,
      name,
      email: email?.toLowerCase(),
      phone,
      passwordHash: await hashPassword(password),
    });

    emit.toRestaurant(req.auth!.restaurantId, Events.STAFF_UPDATED, { reason: 'created', userId: String(user._id) });
    await recordAudit({
      restaurantId: req.auth!.restaurantId,
      actorId: req.auth!.userId,
      actorName: req.auth!.name,
      action: 'staff.created',
      entityType: 'User',
      entityId: String(user._id),
      metadata: { name, role },
    });
    res.status(201).json(publicUser(user.toObject()));
  }),
);

staffRouter.patch(
  '/:id',
  requirePermission('staff:write'),
  validate({
    params: z.object({ id: z.string().min(1) }),
    body: z.object({
      name: z.string().min(2).max(80).optional(),
      role: z.enum(staffRoles).optional(),
      email: z.string().email().nullable().optional(),
      phone: z.string().min(8).max(15).nullable().optional(),
      status: z.enum(['ACTIVE', 'SUSPENDED']).optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const user = await UserModel.findOne({ _id: req.params.id, restaurantId: req.auth!.restaurantId });
    if (!user) throw ApiError.notFound('Staff member not found');
    if (user.role === 'OWNER') throw ApiError.forbidden('The owner account cannot be changed here');

    const before = { role: user.role, status: user.status };
    const { name, role, email, phone, status } = req.body;
    if (name) user.name = name;
    if (role) user.role = role;
    if (email !== undefined) user.email = email ? email.toLowerCase() : undefined;
    if (phone !== undefined) user.phone = phone ?? undefined;
    if (status) user.status = status;
    await user.save();

    emit.toRestaurant(req.auth!.restaurantId, Events.STAFF_UPDATED, { reason: 'updated', userId: String(user._id) });
    await recordAudit({
      restaurantId: req.auth!.restaurantId,
      actorId: req.auth!.userId,
      actorName: req.auth!.name,
      action: 'staff.updated',
      entityType: 'User',
      entityId: String(user._id),
      metadata: { before, after: { role: user.role, status: user.status }, name: user.name },
    });
    res.json(publicUser(user.toObject()));
  }),
);

staffRouter.post(
  '/:id/reset-password',
  requirePermission('staff:write'),
  validate({
    params: z.object({ id: z.string().min(1) }),
    body: z.object({ password: z.string().min(8).max(72) }),
  }),
  asyncHandler(async (req, res) => {
    const user = await UserModel.findOne({ _id: req.params.id, restaurantId: req.auth!.restaurantId });
    if (!user) throw ApiError.notFound('Staff member not found');
    user.passwordHash = await hashPassword(req.body.password);
    user.refreshTokenHash = undefined;
    await user.save();

    await recordAudit({
      restaurantId: req.auth!.restaurantId,
      actorId: req.auth!.userId,
      actorName: req.auth!.name,
      action: 'staff.password_reset',
      entityType: 'User',
      entityId: String(user._id),
      metadata: { name: user.name },
    });
    res.json({ ok: true });
  }),
);
