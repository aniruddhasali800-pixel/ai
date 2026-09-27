import { Router } from 'express';
import { z } from 'zod';
import { RestaurantModel } from '../../models';
import { asyncHandler } from '../../utils/asyncHandler';
import { validate } from '../../middleware/validate';
import { requireAuth } from '../../middleware/auth';
import { requirePermission } from '../../middleware/rbac';
import { ApiError } from '../../utils/httpError';
import { emit, Events } from '../../realtime/emit';
import { recordAudit } from '../../services/audit.service';

export const restaurantRouter = Router();

restaurantRouter.use(requireAuth);

restaurantRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const restaurant = await RestaurantModel.findById(req.auth!.restaurantId).lean();
    if (!restaurant) throw ApiError.notFound('Restaurant not found');
    res.json(restaurant);
  }),
);

const patchSchema = z.object({
  name: z.string().min(2).max(80).optional(),
  phone: z.string().max(20).optional(),
  email: z.string().email().optional(),
  address: z
    .object({
      line1: z.string().max(120).optional(),
      city: z.string().max(60).optional(),
      state: z.string().max(60).optional(),
      pincode: z.string().max(10).optional(),
    })
    .optional(),
  taxPercent: z.number().min(0).max(28).optional(),
  serviceChargePercent: z.number().min(0).max(20).optional(),
  hours: z.object({ open: z.string().max(5), close: z.string().max(5) }).optional(),
  branding: z
    .object({
      logoUrl: z.string().max(500).optional(),
      coverUrl: z.string().max(500).optional(),
      tagline: z.string().max(160).optional(),
    })
    .optional(),
  payment: z
    .object({
      upiId: z.string().max(80).optional(),
      upiName: z.string().max(80).optional(),
    })
    .optional(),
  settings: z
    .object({
      acceptingOrders: z.boolean().optional(),
      autoAcceptOrders: z.boolean().optional(),
      billFooterNote: z.string().max(200).optional(),
      bookingEnabled: z.boolean().optional(),
      bookingSlotMinutes: z.number().min(5).max(180).optional(),
      bookingDurationMinutes: z.number().min(15).max(300).optional(),
      bookingReminderMinutes: z.number().min(5).max(240).optional(),
      allowWaiterCash: z.boolean().optional(),
    })
    .optional(),
});

restaurantRouter.patch(
  '/',
  requirePermission('settings:write'),
  validate({ body: patchSchema }),
  asyncHandler(async (req, res) => {
    const restaurantId = req.auth!.restaurantId;
    const previous = await RestaurantModel.findById(restaurantId).lean();
    if (!previous) throw ApiError.notFound('Restaurant not found');

    const update: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(req.body)) {
      if (value === undefined) continue;
      if (key === 'address' || key === 'branding' || key === 'settings' || key === 'hours' || key === 'payment') {
        update[key] = { ...(previous as Record<string, any>)[key], ...(value as object) };
      } else {
        update[key] = value;
      }
    }

    const restaurant = await RestaurantModel.findByIdAndUpdate(restaurantId, update, { new: true }).lean();
    emit.toRestaurant(restaurantId, Events.MENU_UPDATED, { reason: 'settings' });

    const changed = Object.keys(req.body);
    await recordAudit({
      restaurantId,
      actorId: req.auth!.userId,
      actorName: req.auth!.name,
      action: 'settings.updated',
      entityType: 'Restaurant',
      entityId: restaurantId,
      metadata: {
        fields: changed,
        taxPercent: req.body.taxPercent,
        serviceChargePercent: req.body.serviceChargePercent,
      },
    });
    res.json(restaurant);
  }),
);
