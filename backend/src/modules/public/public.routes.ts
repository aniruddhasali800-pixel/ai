import { Router } from 'express';
import { z } from 'zod';
import {
  AddonModel,
  BillModel,
  CategoryModel,
  CustomerRequestModel,
  OrderModel,
  ProductModel,
  RestaurantModel,
  TableModel,
  TableSessionModel,
} from '../../models';
import { asyncHandler } from '../../utils/asyncHandler';
import { validate } from '../../middleware/validate';
import { publicLimiter, publicWriteLimiter } from '../../middleware/rateLimit';
import { ApiError } from '../../utils/httpError';
import { emit, Events } from '../../realtime/emit';
import { openSession, setTableStatus } from '../../services/table.service';
import { createOrder } from '../../services/order.service';
import { checkAvailability, createBooking } from '../../services/booking.service';
import { publicBillView, createBill } from '../../services/billing.service';
import { notifyRoles } from '../../services/notification.service';
import { REQUEST_TYPES } from '../../types/constants';
import { queryOf } from '../../utils/query';
import type { Role } from '../../types/constants';

export const publicRouter = Router();

publicRouter.use(publicLimiter);

async function tableByQrToken(token: string) {
  const table = await TableModel.findOne({ qrToken: token }).lean();
  if (!table) throw ApiError.notFound('This QR code is not active any more');
  return table;
}

async function sessionByPublicToken(token: string) {
  const session = await TableSessionModel.findOne({ publicToken: token }).lean();
  if (!session) throw ApiError.notFound('This table session has ended');
  return session;
}

/** Everything the guest phone needs after scanning a table QR. */
publicRouter.get(
  '/menu/:tableToken',
  asyncHandler(async (req, res) => {
    const table = await tableByQrToken(req.params.tableToken);
    const restaurant = await RestaurantModel.findById(table.restaurantId).lean();
    if (!restaurant) throw ApiError.notFound('Restaurant not found');

    const session = table.activeSessionId
      ? await TableSessionModel.findOne({ _id: table.activeSessionId, status: { $ne: 'CLOSED' } }).lean()
      : null;

    const [categories, products, addons] = await Promise.all([
      CategoryModel.find({ restaurantId: restaurant._id, isActive: true }).sort({ sortOrder: 1, name: 1 }).lean(),
      ProductModel.find({ restaurantId: restaurant._id, isActive: true }).sort({ sortOrder: 1, name: 1 }).lean(),
      AddonModel.find({ restaurantId: restaurant._id, isActive: true }).sort({ name: 1 }).lean(),
    ]);

    res.json({
      restaurant: {
        _id: String(restaurant._id),
        name: restaurant.name,
        slug: restaurant.slug,
        phone: restaurant.phone ?? '',
        address: restaurant.address,
        currency: restaurant.currency,
        hours: restaurant.hours,
        branding: restaurant.branding,
        acceptingOrders: restaurant.settings?.acceptingOrders ?? true,
        bookingEnabled: restaurant.settings?.bookingEnabled ?? true,
        taxPercent: restaurant.taxPercent,
        serviceChargePercent: restaurant.serviceChargePercent,
      },
      table: { _id: String(table._id), number: table.number, section: table.section, status: table.status },
      categories: categories.map((c) => ({ _id: String(c._id), name: c.name, description: c.description })),
      products: products.map((p) => ({
        _id: String(p._id),
        categoryId: String(p.categoryId),
        name: p.name,
        description: p.description,
        price: p.price,
        imageUrl: p.imageUrl,
        isVeg: p.isVeg,
        taxPercent: p.taxPercent,
        prepMinutes: p.prepMinutes,
        tags: p.tags,
        addonIds: p.addonIds.map((id) => String(id)),
      })),
      addons: addons.map((a) => ({ _id: String(a._id), name: a.name, price: a.price })),
      session: session
        ? {
            publicToken: session.publicToken,
            status: session.status,
            guestCount: session.guestCount,
            customerName: session.customerName,
          }
        : null,
    });
  }),
);

/** Guest taps "Start ordering" — creates (or rejoins) the table session. */
publicRouter.post(
  '/table-sessions',
  publicWriteLimiter,
  validate({
    body: z.object({
      tableToken: z.string().min(6).max(64),
      guestCount: z.number().int().min(1).max(40).optional(),
      customerName: z.string().max(80).optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const table = await tableByQrToken(req.body.tableToken);
    if (table.status === 'CLEANING') throw ApiError.conflict('This table is being cleaned — please give us a minute');

    const session = await openSession({
      restaurantId: String(table.restaurantId),
      tableId: String(table._id),
      guestCount: req.body.guestCount,
      customerName: req.body.customerName,
      via: 'QR',
    });

    const restaurantId = String(table.restaurantId);
    await notifyRoles(restaurantId, ['WAITER'], {
      type: 'SYSTEM',
      title: `Table ${table.number} seated`,
      body: `${session.guestCount} guest(s) joined via QR${session.customerName ? ` · ${session.customerName}` : ''}`,
      entityType: 'Table',
      entityId: String(table._id),
    });

    res.status(201).json({
      session: {
        _id: String(session._id),
        publicToken: session.publicToken,
        status: session.status,
        guestCount: session.guestCount,
        customerName: session.customerName,
        openedAt: session.openedAt,
      },
      table: { _id: String(table._id), number: table.number, section: table.section },
      restaurantId,
    });
  }),
);

/** Live view of the guest's session: orders, running total, open requests and bill state. */
publicRouter.get(
  '/session/:publicToken',
  asyncHandler(async (req, res) => {
    const session = await sessionByPublicToken(req.params.publicToken);
    const [table, orders, requests, bill] = await Promise.all([
      TableModel.findById(session.tableId).lean(),
      OrderModel.find({ tableSessionId: session._id, status: { $ne: 'CANCELLED' } }).sort({ placedAt: 1 }).lean(),
      CustomerRequestModel.find({ tableSessionId: session._id, status: { $ne: 'DONE' } })
        .sort({ createdAt: -1 })
        .limit(12)
        .lean(),
      BillModel.findOne({ tableSessionId: session._id, status: 'ISSUED', paymentStatus: 'UNPAID' }).lean(),
    ]);

    res.json({
      session: {
        _id: String(session._id),
        publicToken: session.publicToken,
        status: session.status,
        guestCount: session.guestCount,
        customerName: session.customerName,
        openedAt: session.openedAt,
      },
      table: table ? { _id: String(table._id), number: table.number, section: table.section } : null,
      orders: orders.map((order) => ({
        _id: String(order._id),
        orderNumber: order.orderNumber,
        status: order.status,
        items: order.items,
        subtotal: order.subtotal,
        taxTotal: order.taxTotal,
        serviceCharge: order.serviceCharge,
        grandTotal: order.grandTotal,
        notes: order.notes,
        placedAt: order.placedAt,
      })),
      requests: requests.map((r) => ({
        _id: String(r._id),
        type: r.type,
        note: r.note,
        status: r.status,
        tendered: r.tendered ?? null,
        collectedAt: r.collectedAt ?? null,
        createdAt: r.createdAt,
      })),
      bill: bill
        ? { _id: String(bill._id), billNumber: bill.billNumber, grandTotal: bill.grandTotal, publicToken: bill.publicToken }
        : null,
      runningTotal: orders
        .filter((o) => o.status !== 'COMPLETED')
        .reduce((sum, o) => sum + o.grandTotal, 0),
    });
  }),
);

const orderSchema = z.object({
  items: z
    .array(
      z.object({
        productId: z.string().min(1),
        qty: z.number().int().min(1).max(99),
        addonIds: z.array(z.string()).max(12).optional(),
        notes: z.string().max(240).optional(),
      }),
    )
    .min(1)
    .max(60),
  customerName: z.string().max(80).optional(),
  notes: z.string().max(300).optional(),
});

/** Guest places an order — prices and totals are always rebuilt on the server. */
publicRouter.post(
  '/session/:publicToken/orders',
  publicWriteLimiter,
  validate({ body: orderSchema }),
  asyncHandler(async (req, res) => {
    const session = await sessionByPublicToken(req.params.publicToken);
    if (session.status === 'CLOSED') throw ApiError.conflict('This table session is closed');

    const pendingBill = await BillModel.findOne({
      tableSessionId: session._id,
      status: 'ISSUED',
      paymentStatus: 'UNPAID',
    }).lean();
    if (pendingBill) throw ApiError.conflict('A bill has already been issued for this table — please ask your waiter for help');

    const order = await createOrder({
      restaurantId: String(session.restaurantId),
      source: 'DINE_IN_QR',
      tableId: String(session.tableId),
      tableSessionId: String(session._id),
      items: req.body.items,
      customerName: req.body.customerName ?? session.customerName,
      notes: req.body.notes ?? '',
    });

    res.status(201).json(order);
  }),
);

const requestSchema = z.object({
  type: z.enum(REQUEST_TYPES),
  note: z.string().max(200).optional(),
});

/** Asking for the bill or for the cash round is the same thing: close this table out. */
const SETTLE_TYPES: string[] = ['BILL', 'CASH_PAYMENT'];

/**
 * Guest calls a waiter, asks for water, asks for the bill, or asks to pay in cash.
 *
 * A settle tap is not a favour to wait for — the bill is totalled right here, so the
 * phone gets a scannable amount instead of a guest sitting at a table hoping somebody
 * behind the counter notices.
 */
publicRouter.post(
  '/session/:publicToken/requests',
  publicWriteLimiter,
  validate({ body: requestSchema }),
  asyncHandler(async (req, res) => {
    const session = await sessionByPublicToken(req.params.publicToken);
    if (session.status === 'CLOSED') throw ApiError.conflict('This table session is closed');

    const table = await TableModel.findById(session.tableId).lean();
    const restaurantId = String(session.restaurantId);
    const type = req.body.type;
    const tableNumber = table?.number ?? '';

    let bill = await BillModel.findOne({
      tableSessionId: session._id,
      status: 'ISSUED',
      paymentStatus: 'UNPAID',
    }).lean();

    if (SETTLE_TYPES.includes(type) && !bill) {
      try {
        const created = await createBill({
          restaurantId,
          actor: { userId: null, role: 'SYSTEM', name: 'Guest request' },
          sessionId: String(session._id),
        });
        bill = await BillModel.findById(created._id).lean();
      } catch (err) {
        // Nothing has been ordered on this table yet, so there is nothing to total.
        // The counter still hears the ask, exactly as before.
        if (!(err instanceof ApiError) || err.code !== 'CONFLICT') throw err;
      }
    }

    const request = await CustomerRequestModel.create({
      restaurantId,
      tableId: session.tableId,
      tableSessionId: session._id,
      type,
      note: req.body.note ?? '',
      billId: bill?._id ?? null,
    });

    const total = bill ? `₹${bill.grandTotal.toFixed(2)}` : '';

    if (bill) {
      // createBill has already told the cashier and the owner the bill exists, and pushed
      // it into this session room, which is what lights up the guest's screen.
      const roles: Role[] = type === 'CASH_PAYMENT' ? ['WAITER', 'CASHIER'] : ['WAITER'];
      await notifyRoles(restaurantId, roles, {
        type: 'BILL_REQUESTED',
        title:
          type === 'CASH_PAYMENT'
            ? `Table ${tableNumber} is paying in cash${total ? ` · ${total}` : ''}`
            : `Bill ${bill.billNumber} is on Table ${tableNumber}'s phone`,
        body:
          type === 'CASH_PAYMENT'
            ? 'Take the cash from the table, then confirm it at the counter.'
            : `${total} · scan-to-pay is on the guest's screen`,
        entityType: 'CustomerRequest',
        entityId: String(request._id),
      });
    } else if (SETTLE_TYPES.includes(type)) {
      await TableSessionModel.updateOne({ _id: session._id }, { status: 'BILL_REQUESTED' });
      if (table && ['OCCUPIED', 'ORDERING', 'FOOD_READY'].includes(table.status)) {
        await setTableStatus(table._id, 'BILL_REQUESTED');
      }
      await notifyRoles(restaurantId, ['CASHIER', 'WAITER', 'OWNER'], {
        type: 'BILL_REQUESTED',
        title: `Table ${tableNumber} asked to settle up`,
        body: session.customerName ? `${session.customerName} is ready to pay` : 'Nothing unbilled on this table yet',
        entityType: 'CustomerRequest',
        entityId: String(request._id),
      });
    } else {
      // The bell rings for the waiter on that patch, for everyone else on the floor,
      // and for the owner — one of them always answers even when a colleague is off.
      await notifyRoles(restaurantId, ['WAITER', 'OWNER'], {
        type: 'CUSTOMER_REQUEST',
        title: `Table ${tableNumber} · ${type.replace(/_/g, ' ').toLowerCase()}`,
        body: req.body.note ? String(req.body.note) : 'Guest is waiting for assistance',
        entityType: 'CustomerRequest',
        entityId: String(request._id),
      });
      if (table?.assignedWaiterId) {
        emit.toWaiter(String(table.assignedWaiterId), Events.REQUEST_CREATED, {
          ...request.toObject(),
          tableNumber,
          mine: true,
        });
      }
    }

    const payload = {
      ...request.toObject(),
      tableNumber,
      bill: bill
        ? {
            _id: String(bill._id),
            billNumber: bill.billNumber,
            grandTotal: bill.grandTotal,
            publicToken: bill.publicToken,
          }
        : null,
    };
    emit.toRestaurant(restaurantId, Events.REQUEST_CREATED, payload);
    emit.toSession(session.publicToken, Events.REQUEST_CREATED, payload);
    res.status(201).json(payload);
  }),
);

/** Digital bill shared with the guest phone — token-scoped, no internal ids. */
publicRouter.get(
  '/bill/:billToken',
  asyncHandler(async (req, res) => {
    res.json(await publicBillView(req.params.billToken));
  }),
);

/** Public branding block used by the QR landing page and the booking page. */
publicRouter.get(
  '/restaurant/:idOrSlug',
  asyncHandler(async (req, res) => {
    const { idOrSlug } = req.params;
    const restaurant = await RestaurantModel.findOne(
      idOrSlug.match(/^[0-9a-fA-F]{24}$/) ? { _id: idOrSlug } : { slug: idOrSlug.toLowerCase() },
    )
      .select('name slug phone address branding hours settings.bookingEnabled settings.bookingSlotMinutes settings.bookingDurationMinutes currency')
      .lean();
    if (!restaurant) throw ApiError.notFound('Restaurant not found');
    res.json(restaurant);
  }),
);

publicRouter.get(
  '/bookings/availability',
  validate({
    query: z.object({
      restaurantId: z.string().min(1),
      startAt: z.string().min(10),
      guests: z.coerce.number().int().min(1).max(40),
      durationMinutes: z.coerce.number().int().min(15).max(300).optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const q = queryOf<{ restaurantId: string; startAt: string; guests: number; durationMinutes?: number }>(req);
    const result = await checkAvailability({
      restaurantId: q.restaurantId,
      startAt: new Date(q.startAt),
      durationMinutes: q.durationMinutes ?? 90,
      guests: q.guests,
    });
    res.json(result);
  }),
);

/** Guest books a table from the public page. Booking starts as PENDING for the host to confirm. */
publicRouter.post(
  '/bookings',
  publicWriteLimiter,
  validate({
    body: z.object({
      restaurantId: z.string().min(1),
      customerName: z.string().min(2).max(80),
      customerPhone: z.string().min(6).max(20),
      customerEmail: z.string().email().max(120).optional(),
      startAt: z.string().min(10),
      guests: z.number().int().min(1).max(40),
      notes: z.string().max(300).optional(),
      tableId: z.string().optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const restaurant = await RestaurantModel.findById(req.body.restaurantId).lean();
    if (!restaurant) throw ApiError.notFound('Restaurant not found');
    if (!(restaurant.settings?.bookingEnabled ?? true)) {
      throw ApiError.conflict('This restaurant is not taking table bookings right now');
    }

    const booking = await createBooking({
      restaurantId: req.body.restaurantId,
      tableId: req.body.tableId,
      customerName: req.body.customerName,
      customerPhone: req.body.customerPhone,
      customerEmail: req.body.customerEmail,
      notes: req.body.notes,
      startAt: new Date(req.body.startAt),
      durationMinutes: restaurant.settings?.bookingDurationMinutes ?? 90,
      guests: req.body.guests,
      source: 'CUSTOMER',
    });

    const table = booking.tableId ? await TableModel.findById(booking.tableId).select('number section').lean() : null;
    res.status(201).json({
      booking,
      restaurantName: restaurant.name,
      table: table ? { number: table.number, section: table.section } : null,
    });
  }),
);
