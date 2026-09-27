import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../utils/asyncHandler';
import { validate } from '../../middleware/validate';
import { requireAuth } from '../../middleware/auth';
import { requirePermission } from '../../middleware/rbac';
import {
  dashboard,
  operationsReport,
  paymentReport,
  productReport,
  resolveRange,
  salesReport,
} from '../../services/report.service';
import { queryOf } from '../../utils/query';

export const reportsRouter = Router();

reportsRouter.use(requireAuth);

const rangeQuery = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  days: z.coerce.number().int().min(1).max(366).optional(),
});

const salesQuery = rangeQuery.extend({
  granularity: z.enum(['day', 'week', 'month', 'year']).optional(),
});

type RangeQuery = z.infer<typeof rangeQuery>;
type SalesQuery = z.infer<typeof salesQuery>;

reportsRouter.get(
  '/dashboard',
  requirePermission('reports:read'),
  asyncHandler(async (req, res) => {
    res.json(await dashboard(req.auth!.restaurantId));
  }),
);

reportsRouter.get(
  '/sales',
  requirePermission('reports:read'),
  validate({ query: salesQuery }),
  asyncHandler(async (req, res) => {
    const q = queryOf<SalesQuery>(req);
    const { from, to } = resolveRange(q.from, q.to, q.days ?? 7);
    res.json(await salesReport(req.auth!.restaurantId, { from, to, granularity: q.granularity }));
  }),
);

reportsRouter.get(
  '/products',
  requirePermission('reports:read'),
  validate({ query: rangeQuery }),
  asyncHandler(async (req, res) => {
    const q = queryOf<RangeQuery>(req);
    const { from, to } = resolveRange(q.from, q.to, q.days ?? 30);
    res.json(await productReport(req.auth!.restaurantId, from, to));
  }),
);

reportsRouter.get(
  '/payments',
  requirePermission('reports:read'),
  validate({ query: rangeQuery }),
  asyncHandler(async (req, res) => {
    const q = queryOf<RangeQuery>(req);
    const { from, to } = resolveRange(q.from, q.to, q.days ?? 30);
    res.json(await paymentReport(req.auth!.restaurantId, from, to));
  }),
);

reportsRouter.get(
  '/operations',
  requirePermission('reports:read'),
  validate({ query: rangeQuery }),
  asyncHandler(async (req, res) => {
    const q = queryOf<RangeQuery>(req);
    const { from, to } = resolveRange(q.from, q.to, q.days ?? 30);
    res.json(await operationsReport(req.auth!.restaurantId, from, to));
  }),
);
