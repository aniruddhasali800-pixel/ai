import { Router } from 'express';
import { env } from './config/env';
import { publicRouter } from './modules/public/public.routes';
import { authRouter } from './modules/auth/auth.routes';
import { restaurantRouter } from './modules/restaurants/restaurant.routes';
import { staffRouter } from './modules/staff/staff.routes';
import { menuRouter } from './modules/menu/menu.routes';
import { uploadsRouter } from './modules/uploads/uploads.routes';
import { tablesRouter } from './modules/tables/tables.routes';
import { ordersRouter } from './modules/orders/orders.routes';
import { kitchenRouter } from './modules/kitchen/kitchen.routes';
import { waitersRouter } from './modules/waiters/waiters.routes';
import { bookingsRouter } from './modules/bookings/bookings.routes';
import { billingRouter } from './modules/billing/billing.routes';
import { paymentsRouter } from './modules/payments/payments.routes';
import { inventoryRouter } from './modules/inventory/inventory.routes';
import { notificationsRouter } from './modules/notifications/notifications.routes';
import { reportsRouter } from './modules/reports/reports.routes';
import { auditRouter } from './modules/audit/audit.routes';
import { integrationsRouter } from './modules/integrations/integrations.routes';
import { scanRouter } from './modules/scan/scan.routes';

export const apiRouter = Router();

apiRouter.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'sizzle-api', env: env.NODE_ENV, time: new Date().toISOString() });
});

apiRouter.use('/public', publicRouter);
apiRouter.use('/auth', authRouter);
apiRouter.use('/restaurants', restaurantRouter);
apiRouter.use('/staff', staffRouter);
apiRouter.use('/menu', menuRouter);
apiRouter.use('/uploads', uploadsRouter);
apiRouter.use('/tables', tablesRouter);
apiRouter.use('/orders', ordersRouter);
apiRouter.use('/kitchen', kitchenRouter);
apiRouter.use('/waiters', waitersRouter);
apiRouter.use('/bookings', bookingsRouter);
apiRouter.use('/billing', billingRouter);
apiRouter.use('/payments', paymentsRouter);
apiRouter.use('/inventory', inventoryRouter);
apiRouter.use('/notifications', notificationsRouter);
apiRouter.use('/reports', reportsRouter);
apiRouter.use('/audit', auditRouter);
apiRouter.use('/integrations', integrationsRouter);
apiRouter.use('/scan', scanRouter);
