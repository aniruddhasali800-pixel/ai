import { Router } from 'express';
import { z } from 'zod';
import { BillModel, CustomerRequestModel, OrderModel, TableModel, TableSessionModel, UserModel } from '../../models';
import { asyncHandler } from '../../utils/asyncHandler';
import { validate } from '../../middleware/validate';
import { requireAuth } from '../../middleware/auth';
import { requirePermission } from '../../middleware/rbac';
import { ApiError } from '../../utils/httpError';
import { emit, Events } from '../../realtime/emit';
import { openSession, serializeTable, setTableStatus } from '../../services/table.service';
import { notify, notifyRoles } from '../../services/notification.service';
import { recordCashPayment } from '../../services/billing.service';
import { recordAudit } from '../../services/audit.service';
import { REQUEST_TYPES } from '../../types/constants';

export const waitersRouter = Router();

waitersRouter.use(requireAuth);

/** Table map with live session, order totals and open requests per table. */
waitersRouter.get(
  '/map',
  requirePermission('tables:read'),
  asyncHandler(async (req, res) => {
    const restaurantId = req.auth!.restaurantId;
    const [tables, sessions, orders, requests, waiters] = await Promise.all([
      TableModel.find({ restaurantId }).sort({ section: 1, number: 1 }).lean(),
      TableSessionModel.find({ restaurantId, status: { $ne: 'CLOSED' } }).lean(),
      OrderModel.find({
        restaurantId,
        status: { $in: ['PLACED', 'ACCEPTED', 'PREPARING', 'READY', 'SERVED'] },
      })
        .select('orderNumber tableId tableSessionId status grandTotal items')
        .lean(),
      CustomerRequestModel.find({ restaurantId, status: { $ne: 'DONE' } }).lean(),
      UserModel.find({ restaurantId, role: 'WAITER', status: 'ACTIVE' }).select('name').lean(),
    ]);

    const sessionByTable = new Map(sessions.map((s) => [String(s.tableId), s]));
    const waiterNames = new Map(waiters.map((w) => [String(w._id), w.name]));

    res.json({
      data: tables.map((table) => {
        const session = sessionByTable.get(String(table._id));
        const tableOrders = orders.filter((o) => String(o.tableId) === String(table._id));
        return {
          ...serializeTable(table),
          assignedWaiterName: table.assignedWaiterId ? waiterNames.get(String(table.assignedWaiterId)) ?? null : null,
          mine: String(table.assignedWaiterId ?? '') === req.auth!.userId,
          session: session
            ? {
                _id: String(session._id),
                publicToken: session.publicToken,
                status: session.status,
                guestCount: session.guestCount,
                customerName: session.customerName,
                openedAt: session.openedAt,
              }
            : null,
          activeOrders: tableOrders.map((o) => ({
            _id: String(o._id),
            orderNumber: o.orderNumber,
            status: o.status,
            grandTotal: o.grandTotal,
            itemCount: o.items.reduce((sum, item) => sum + item.qty, 0),
          })),
          openRequests: requests
            .filter((r) => String(r.tableId) === String(table._id))
            .map((r) => ({ _id: String(r._id), type: r.type, note: r.note, status: r.status, createdAt: r.createdAt })),
          runningTotal: tableOrders.reduce((sum, o) => sum + o.grandTotal, 0),
        };
      }),
    });
  }),
);

waitersRouter.get(
  '/requests',
  requirePermission('requests:read'),
  asyncHandler(async (req, res) => {
    const restaurantId = req.auth!.restaurantId;
    const onlyOpen = req.query.open !== 'false';
    const requests = await CustomerRequestModel.find({
      restaurantId,
      ...(onlyOpen ? { status: { $ne: 'DONE' } } : {}),
    })
      .sort({ createdAt: -1 })
      .limit(60)
      .lean();

    const tables = await TableModel.find({ restaurantId }).select('number assignedWaiterId').lean();
    const tableById = new Map(tables.map((t) => [String(t._id), t]));
    // A cash round is collected against a figure, so the waiter screen has to show it.
    const billIds = [...new Set(requests.filter((r) => r.billId).map((r) => String(r.billId)))];
    const bills = billIds.length ? await BillModel.find({ _id: { $in: billIds }, restaurantId }).select('billNumber grandTotal').lean() : [];
    const billById = new Map(bills.map((b) => [String(b._id), b]));

    res.json({
      data: requests.map((r) => {
        const bill = r.billId ? billById.get(String(r.billId)) : undefined;
        return {
          ...r,
          tableNumber: tableById.get(String(r.tableId))?.number ?? '—',
          mine: String(tableById.get(String(r.tableId))?.assignedWaiterId ?? '') === req.auth!.userId,
          billNumber: bill?.billNumber ?? null,
          billGrandTotal: bill?.grandTotal ?? null,
        };
      }),
    });
  }),
);

waitersRouter.patch(
  '/requests/:id',
  requirePermission('requests:write'),
  validate({
    params: z.object({ id: z.string() }),
    body: z.object({ status: z.enum(['ACKNOWLEDGED', 'DONE']) }),
  }),
  asyncHandler(async (req, res) => {
    const restaurantId = req.auth!.restaurantId;
    const request = await CustomerRequestModel.findOne({ _id: req.params.id, restaurantId });
    if (!request) throw ApiError.notFound('Request not found');

    request.status = req.body.status;
    request.handledByUserId = req.auth!.userId as never;
    request.handledAt = req.body.status === 'DONE' ? new Date() : request.handledAt;
    await request.save();

    const payload = { ...request.toObject(), tableNumber: undefined };
    emit.toRestaurant(restaurantId, Events.REQUEST_UPDATED, payload);
    const session = await TableSessionModel.findById(request.tableSessionId).select('publicToken').lean();
    if (session) emit.toSession(session.publicToken, Events.REQUEST_UPDATED, payload);
    res.json(payload);
  }),
);

const cashBody = z.object({ tendered: z.number().min(0).max(1_000_000) });

async function cashRequestOr404(restaurantId: string, id: string) {
  const request = await CustomerRequestModel.findOne({ _id: id, restaurantId });
  if (!request) throw ApiError.notFound('Request not found');
  if (request.type !== 'CASH_PAYMENT') throw ApiError.badRequest('Only a cash-payment request moves cash');
  if (request.status === 'DONE') throw ApiError.conflict('That cash round is already closed');
  if (!request.billId) throw ApiError.conflict('Issue the bill for this table first');
  const bill = await BillModel.findOne({ _id: request.billId, restaurantId });
  if (!bill) throw ApiError.notFound('Bill not found');
  return { request, bill };
}

/** A waiter took the notes at the table; the amount now waits for the counter. */
waitersRouter.post(
  '/requests/:id/collect',
  requirePermission('requests:write'),
  validate({ params: z.object({ id: z.string() }), body: cashBody }),
  asyncHandler(async (req, res) => {
    const restaurantId = req.auth!.restaurantId;
    const { request, bill } = await cashRequestOr404(restaurantId, req.params.id);
    if (bill.paymentStatus !== 'UNPAID') throw ApiError.conflict('This bill is already settled');
    if (req.body.tendered < bill.grandTotal) {
      throw ApiError.badRequest(`Table ${bill.tableNumber} owes ${bill.grandTotal.toFixed(2)}`);
    }

    request.status = 'ACKNOWLEDGED';
    request.tendered = req.body.tendered;
    request.collectedByUserId = req.auth!.userId as never;
    request.collectedAt = new Date();
    request.handledByUserId = req.auth!.userId as never;
    await request.save();

    const session = await TableSessionModel.findById(request.tableSessionId).select('publicToken').lean();
    const payload = { ...request.toObject(), tableNumber: bill.tableNumber };
    emit.toRestaurant(restaurantId, Events.REQUEST_UPDATED, payload);
    if (session) emit.toSession(session.publicToken, Events.REQUEST_UPDATED, payload);

    await notify({
      restaurantId,
      recipientId: req.auth!.userId,
      type: 'CUSTOMER_REQUEST',
      title: `Carry ${req.body.tendered.toFixed(2)} to the counter`,
      body: `Table ${bill.tableNumber} · bill ${bill.billNumber}`,
      entityType: 'CustomerRequest',
      entityId: String(request._id),
    });
    await notifyRoles(restaurantId, ['CASHIER'], {
      type: 'CUSTOMER_REQUEST',
      title: `Cash of ${req.body.tendered.toFixed(2)} coming in for table ${bill.tableNumber}`,
      body: `${bill.billNumber} · ${req.auth!.name} collected it at the table`,
      entityType: 'CustomerRequest',
      entityId: String(request._id),
    });
    await recordAudit({
      restaurantId,
      actorId: req.auth!.userId,
      actorName: req.auth!.name,
      action: 'cash.collected',
      entityType: 'CustomerRequest',
      entityId: String(request._id),
      metadata: { billNumber: bill.billNumber, grandTotal: bill.grandTotal, tendered: req.body.tendered },
    });
    res.json(payload);
  }),
);

/** The counter counts the notes into the drawer — the bill settles and the table frees. */
waitersRouter.post(
  '/requests/:id/settle',
  requirePermission('payments:write'),
  validate({ params: z.object({ id: z.string() }), body: z.object({ note: z.string().max(160).optional() }) }),
  asyncHandler(async (req, res) => {
    const restaurantId = req.auth!.restaurantId;
    const { request, bill } = await cashRequestOr404(restaurantId, req.params.id);

    const settled = await recordCashPayment({
      restaurantId,
      billId: String(bill._id),
      actor: { userId: req.auth!.userId, role: req.auth!.role, name: req.auth!.name },
      tendered: request.tendered ?? undefined,
      note: req.body.note ?? (request.collectedByUserId ? 'Collected at the table by the waiter' : ''),
    });

    request.status = 'DONE';
    request.handledByUserId = req.auth!.userId as never;
    request.handledAt = new Date();
    await request.save();

    const session = await TableSessionModel.findById(request.tableSessionId).select('publicToken').lean();
    const payload = { ...request.toObject(), tableNumber: bill.tableNumber };
    emit.toRestaurant(restaurantId, Events.REQUEST_UPDATED, payload);
    if (session) emit.toSession(session.publicToken, Events.REQUEST_UPDATED, payload);

    if (bill.tableId) {
      const table = await TableModel.findById(bill.tableId).select('number assignedWaiterId').lean();
      if (table?.assignedWaiterId) {
        await notify({
          restaurantId,
          recipientId: String(table.assignedWaiterId),
          type: 'PAYMENT_SUCCEEDED',
          title: `Table ${table.number} is settled`,
          body: 'The drawer is square — clear the table when you get a moment',
          entityType: 'Bill',
          entityId: String(bill._id),
        });
      }
    }

    res.json({ request: payload, ...settled });
  }),
);

waitersRouter.post(
  '/tables/:id/seat',
  requirePermission('tables:write'),
  validate({
    params: z.object({ id: z.string() }),
    body: z.object({ guestCount: z.number().int().min(1).max(40).optional(), customerName: z.string().max(80).optional() }),
  }),
  asyncHandler(async (req, res) => {
    const restaurantId = req.auth!.restaurantId;
    const table = await TableModel.findOne({ _id: req.params.id, restaurantId }).lean();
    if (!table) throw ApiError.notFound('Table not found');
    if (table.status === 'CLEANING') throw ApiError.conflict('This table still needs cleaning');

    const session = await openSession({
      restaurantId,
      tableId: String(table._id),
      guestCount: req.body.guestCount,
      customerName: req.body.customerName,
      via: 'STAFF',
    });
    res.status(201).json({
      sessionId: String(session._id),
      publicToken: session.publicToken,
      guestCount: session.guestCount,
    });
  }),
);

waitersRouter.post(
  '/tables/:id/clear',
  requirePermission('tables:write'),
  validate({ params: z.object({ id: z.string() }) }),
  asyncHandler(async (req, res) => {
    const restaurantId = req.auth!.restaurantId;
    const table = await TableModel.findOne({ _id: req.params.id, restaurantId }).lean();
    if (!table) throw ApiError.notFound('Table not found');

    const unpaid = await OrderModel.countDocuments({
      restaurantId,
      tableId: table._id,
      status: { $nin: ['CANCELLED', 'COMPLETED'] },
    });
    if (unpaid > 0) throw ApiError.conflict('Settle or cancel the running orders before clearing this table');

    await TableSessionModel.updateMany(
      { tableId: table._id, status: { $ne: 'CLOSED' } },
      { status: 'CLOSED', closedAt: new Date() },
    );
    // A cleared table must not keep ringing for calls made by the previous party.
    await CustomerRequestModel.updateMany(
      { restaurantId, tableId: table._id, status: { $ne: 'DONE' } },
      { status: 'DONE', handledAt: new Date(), handledByUserId: req.auth!.userId },
    );
    const updated = await setTableStatus(table._id, 'AVAILABLE', { activeSessionId: null, lastCleanedAt: new Date() });
    emit.toRestaurant(restaurantId, Events.TABLE_CLEANED, { tableId: String(table._id), number: table.number });
    res.json(updated);
  }),
);

waitersRouter.post(
  '/tables/:id/transfer',
  requirePermission('tables:write'),
  validate({
    params: z.object({ id: z.string() }),
    body: z.object({ waiterId: z.string().min(1), reason: z.string().max(160).optional() }),
  }),
  asyncHandler(async (req, res) => {
    const restaurantId = req.auth!.restaurantId;
    const table = await TableModel.findOne({ _id: req.params.id, restaurantId }).lean();
    if (!table) throw ApiError.notFound('Table not found');
    const waiter = await UserModel.findOne({ _id: req.body.waiterId, restaurantId, role: 'WAITER', status: 'ACTIVE' }).lean();
    if (!waiter) throw ApiError.badRequest('Pick an active waiter');

    const previousWaiterId = table.assignedWaiterId ? String(table.assignedWaiterId) : null;
    const updated = await TableModel.findByIdAndUpdate(table._id, { assignedWaiterId: waiter._id }, { new: true }).lean();
    if (!updated) throw ApiError.notFound('Table not found');

    emit.toRestaurant(restaurantId, Events.TABLE_UPDATED, serializeTable(updated));
    await notify({
      restaurantId,
      recipientId: String(waiter._id),
      type: 'SYSTEM',
      title: `Table ${table.number} is now yours`,
      body: req.body.reason ? `Transferred: ${req.body.reason}` : 'Table transferred to you',
      entityType: 'Table',
      entityId: String(table._id),
    });
    await recordAudit({
      restaurantId,
      actorId: req.auth!.userId,
      actorName: req.auth!.name,
      action: 'table.transferred',
      entityType: 'Table',
      entityId: String(table._id),
      metadata: { number: table.number, from: previousWaiterId, to: String(waiter._id), reason: req.body.reason ?? '' },
    });
    res.json(serializeTable(updated));
  }),
);

/** Personal shift summary for the mobile profile screen. */
waitersRouter.get(
  '/me/summary',
  requirePermission('tables:read'),
  asyncHandler(async (req, res) => {
    const restaurantId = req.auth!.restaurantId;
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const waiterId = req.auth!.userId;

    const [tables, myOrders, readyOrders, openRequests, bookings] = await Promise.all([
      TableModel.countDocuments({ restaurantId, assignedWaiterId: waiterId }),
      OrderModel.find({
        restaurantId,
        waiterId,
        status: { $nin: ['CANCELLED'] },
        createdAt: { $gte: startOfDay },
      })
        .select('grandTotal')
        .lean(),
      OrderModel.countDocuments({ restaurantId, waiterId, status: 'READY' }),
      CustomerRequestModel.countDocuments({ restaurantId, status: { $ne: 'DONE' } }),
      TableModel.find({ restaurantId, assignedWaiterId: waiterId }).select('_id').lean(),
    ]);

    res.json({
      tablesAssigned: tables,
      ordersToday: myOrders.length,
      salesToday: myOrders.reduce((sum, o) => sum + o.grandTotal, 0),
      awaitingPickup: readyOrders,
      openRequests,
      shiftStartedAt: startOfDay,
      bookings: bookings.length,
    });
  }),
);

waitersRouter.get(
  '/live-orders',
  requirePermission('orders:read'),
  asyncHandler(async (req, res) => {
    const restaurantId = req.auth!.restaurantId;
    const orders = await OrderModel.find({
      restaurantId,
      status: { $in: ['PLACED', 'ACCEPTED', 'PREPARING', 'READY', 'SERVED'] },
      tableId: { $ne: null },
    })
      .sort({ placedAt: -1 })
      .limit(60)
      .lean();
    res.json({ data: orders });
  }),
);

const requestSchema = z.object({
  tableId: z.string().min(1),
  type: z.enum(REQUEST_TYPES),
  note: z.string().max(200).optional(),
});

waitersRouter.post(
  '/requests',
  requirePermission('requests:write'),
  validate({ body: requestSchema }),
  asyncHandler(async (req, res) => {
    const restaurantId = req.auth!.restaurantId;
    const table = await TableModel.findOne({ _id: req.body.tableId, restaurantId }).lean();
    if (!table) throw ApiError.notFound('Table not found');
    if (!table.activeSessionId) throw ApiError.conflict('This table has no open session');

    const request = await CustomerRequestModel.create({
      restaurantId,
      tableId: table._id,
      tableSessionId: table.activeSessionId,
      type: req.body.type,
      note: req.body.note ?? '',
    });
    const payload = { ...request.toObject(), tableNumber: table.number };
    emit.toRestaurant(restaurantId, Events.REQUEST_CREATED, payload);
    res.status(201).json(payload);
  }),
);
