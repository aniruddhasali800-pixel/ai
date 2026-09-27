import { Types } from 'mongoose';
import { OrderModel, RestaurantModel, TableModel, TableSessionModel, nextSeq } from '../models';
import {
  priceOrderItems,
  computeTotals,
  externalLines,
  type DiscountInput,
  type IncomingItem,
  type PricedLine,
} from './pricing.service';
import { emit, Events } from '../realtime/emit';
import { ApiError } from '../utils/httpError';
import { randomToken } from '../utils/tokens';
import { setTableStatus, touchSession } from './table.service';
import { notify, notifyRoles } from './notification.service';
import { deductForOrder } from './inventory.service';
import { recordAudit } from './audit.service';
import {
  ORDER_TRANSITIONS,
  type OrderSource,
  type OrderStatus,
  type Role,
} from '../types/constants';

const SOURCE_PREFIX: Record<OrderSource, string> = {
  DINE_IN_QR: 'D',
  DINE_IN_WAITER: 'D',
  CASHIER: 'D',
  SWIGGY: 'S',
  ZOMATO: 'Z',
  WEBSITE: 'W',
  PHONE: 'P',
  OTHER: 'O',
};

export function statusEventName(status: OrderStatus): string {
  const map: Record<OrderStatus, string> = {
    PLACED: Events.ORDER_CREATED,
    ACCEPTED: Events.ORDER_ACCEPTED,
    PREPARING: Events.ORDER_PREPARING,
    READY: Events.ORDER_READY,
    SERVED: Events.ORDER_SERVED,
    COMPLETED: Events.ORDER_COMPLETED,
    CANCELLED: Events.ORDER_CANCELLED,
  };
  return map[status];
}

/** Roles allowed to move an order into a given status. */
const TRANSITION_ROLES: Record<OrderStatus, Role[]> = {
  PLACED: [],
  ACCEPTED: ['KITCHEN', 'MANAGER', 'OWNER'],
  PREPARING: ['KITCHEN', 'MANAGER', 'OWNER'],
  READY: ['KITCHEN', 'MANAGER', 'OWNER'],
  SERVED: ['WAITER', 'MANAGER', 'OWNER', 'CASHIER'],
  COMPLETED: ['CASHIER', 'WAITER', 'MANAGER', 'OWNER'],
  CANCELLED: ['CASHIER', 'MANAGER', 'OWNER'],
};

interface Actor {
  userId: string | null;
  role: Role | 'SYSTEM';
  name: string;
}

export interface CreateOrderInput {
  restaurantId: string;
  source: OrderSource;
  actor?: Actor;
  tableId?: string | null;
  tableSessionId?: string | null;
  waiterId?: string | null;
  cashierId?: string | null;
  customerName?: string;
  customerPhone?: string;
  customerAddress?: string;
  customerCity?: string;
  notes?: string;
  items?: IncomingItem[];
  externalItems?: { name: string; price: number; qty: number; notes?: string }[];
  externalOrderId?: string;
  integrationMeta?: Record<string, unknown>;
  discount?: DiscountInput;
  billId?: string | null;
  status?: OrderStatus;
  placedAt?: Date;
  acceptedAt?: Date | null;
  completedAt?: Date | null;
  paymentStatus?: 'UNPAID' | 'PAID' | 'REFUNDED';
}

export async function createOrder(input: CreateOrderInput) {
  const restaurant = await RestaurantModel.findById(input.restaurantId).lean();
  if (!restaurant) throw ApiError.notFound('Restaurant not found');

  const isPublicFacing = input.source === 'DINE_IN_QR' || input.source === 'WEBSITE';
  if (isPublicFacing && !restaurant.settings?.acceptingOrders) {
    throw ApiError.conflict('This restaurant is not accepting orders right now');
  }

  let lines: PricedLine[];
  let discount = input.discount;
  if (input.externalItems?.length) {
    lines = externalLines(input.externalItems, restaurant.taxPercent);
    discount = undefined;
  } else {
    lines = (
      await priceOrderItems({
        restaurantId: input.restaurantId,
        items: input.items ?? [],
        discount: input.discount,
        serviceChargePercent: restaurant.serviceChargePercent ?? 0,
        defaultTaxPercent: restaurant.taxPercent ?? 5,
      })
    ).items;
  }

  const totals = computeTotals({
    lines,
    discount,
    serviceChargePercent: input.externalItems?.length ? 0 : restaurant.serviceChargePercent ?? 0,
  });

  // One running sequence per restaurant — a daily reset would collide with the
  // unique (restaurantId, orderNumber) index as soon as the clock rolls over.
  const seq = await nextSeq(`order:${input.restaurantId}`);
  const orderNumber = `${SOURCE_PREFIX[input.source] ?? 'O'}-${String(seq).padStart(3, '0')}`;

  const autoAccept = restaurant.settings?.autoAcceptOrders ?? false;
  const status: OrderStatus = input.status ?? (autoAccept ? 'ACCEPTED' : 'PLACED');

  const now = new Date();
  const order = await OrderModel.create({
    restaurantId: input.restaurantId,
    orderNumber,
    source: input.source,
    tableId: input.tableId ?? null,
    tableSessionId: input.tableSessionId ?? null,
    waiterId: input.waiterId ?? null,
    cashierId: input.cashierId ?? null,
    customerName: input.customerName ?? '',
    customerPhone: input.customerPhone ?? '',
    customerAddress: input.customerAddress ?? '',
    customerCity: input.customerCity ?? '',
    externalOrderId: input.externalOrderId ?? null,
    integrationMeta: input.integrationMeta ?? null,
    items: lines,
    subtotal: totals.subtotal,
    taxTotal: totals.taxTotal,
    serviceCharge: totals.serviceCharge,
    discountAmount: totals.discountAmount,
    discountNote: discount?.note ?? '',
    grandTotal: totals.grandTotal,
    status,
    paymentStatus: input.paymentStatus ?? 'UNPAID',
    billId: input.billId ?? null,
    notes: input.notes ?? '',
    placedAt: input.placedAt ?? now,
    acceptedAt: input.acceptedAt ?? (status === 'ACCEPTED' ? now : null),
    completedAt: input.completedAt ?? null,
    statusHistory: [
      { status: 'PLACED', at: input.placedAt ?? now, byUserId: input.actor?.userId ?? null },
      ...(status === 'ACCEPTED'
        ? [{ status: 'ACCEPTED' as OrderStatus, at: now, byUserId: input.actor?.userId ?? null }]
        : []),
    ],
  });

  const payload = order.toObject();
  const restaurantId = input.restaurantId;

  emit.toKitchen(restaurantId, Events.ORDER_CREATED, payload);
  emit.toRestaurant(restaurantId, Events.ORDER_UPDATED, payload);

  if (order.tableSessionId) {
    await touchSession(order.tableSessionId);
    const table = await TableModel.findOne({ _id: order.tableId, restaurantId }).lean();
    if (table && table.status !== 'BILL_REQUESTED' && table.status !== 'PAYMENT_PENDING') {
      await setTableStatus(table._id, 'ORDERING');
    }
    const session = await TableSessionModel.findById(order.tableSessionId).select('publicToken tableId').lean();
    if (session) {
      emit.toSession(session.publicToken, Events.ORDER_CREATED, payload);
    }
    const waiterIds = table?.assignedWaiterId ? [String(table.assignedWaiterId)] : [];
    const title = `New order ${orderNumber}`;
    if (waiterIds.length) {
      await Promise.all(
        waiterIds.map((id) =>
          notify({
            restaurantId,
            recipientId: id,
            type: 'ORDER_CREATED',
            title,
            body: `Table ${table?.number ?? ''} · ${lines.length} item(s)`,
            entityType: 'Order',
            entityId: String(order._id),
          }),
        ),
      );
    } else if (input.source === 'DINE_IN_QR') {
      await notifyRoles(restaurantId, ['WAITER'], {
        type: 'ORDER_CREATED',
        title,
        body: `Table ${table?.number ?? ''} placed a QR order`,
        entityType: 'Order',
        entityId: String(order._id),
      });
    }
  }

  if (['SWIGGY', 'ZOMATO', 'WEBSITE'].includes(input.source)) {
    emit.toRestaurant(restaurantId, Events.DELIVERY_ORDER, payload);
    await notifyRoles(restaurantId, ['OWNER', 'MANAGER'], {
      type: 'DELIVERY_ORDER',
      title: `${input.source === 'WEBSITE' ? 'Website' : input.source.charAt(0) + input.source.slice(1).toLowerCase()} order ${orderNumber}`,
      body: `${input.customerName || 'Customer'} · ₹${totals.grandTotal.toFixed(2)}`,
      entityType: 'Order',
      entityId: String(order._id),
    });
  }

  return order.toObject();
}

export async function getOrder(restaurantId: string, orderId: string) {
  const order = await OrderModel.findOne({ _id: orderId, restaurantId }).lean();
  if (!order) throw ApiError.notFound('Order not found');
  return order;
}

export interface ListOrdersFilter {
  restaurantId: string;
  status?: OrderStatus | OrderStatus[];
  source?: OrderSource | OrderSource[];
  tableId?: string;
  sessionId?: string;
  activeOnly?: boolean;
  from?: Date;
  to?: Date;
  search?: string;
  page?: number;
  limit?: number;
}

export async function listOrders(filter: ListOrdersFilter) {
  const query: Record<string, unknown> = { restaurantId: filter.restaurantId };
  if (filter.activeOnly) {
    query.status = { $in: ['PLACED', 'ACCEPTED', 'PREPARING', 'READY', 'SERVED'] };
  } else if (filter.status) {
    query.status = Array.isArray(filter.status) ? { $in: filter.status } : filter.status;
  }
  if (filter.source) {
    query.source = Array.isArray(filter.source) ? { $in: filter.source } : filter.source;
  }
  if (filter.tableId) query.tableId = filter.tableId;
  if (filter.sessionId) query.tableSessionId = filter.sessionId;
  if (filter.from || filter.to) {
    query.createdAt = {
      ...(filter.from ? { $gte: filter.from } : {}),
      ...(filter.to ? { $lte: filter.to } : {}),
    };
  }
  if (filter.search) {
    const rx = new RegExp(filter.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    query.$or = [{ orderNumber: rx }, { customerName: rx }, { customerPhone: rx }, { customerCity: rx }, { externalOrderId: rx }];
  }

  const page = Math.max(1, filter.page ?? 1);
  const limit = Math.min(100, Math.max(1, filter.limit ?? 50));
  const [data, total] = await Promise.all([
    OrderModel.find(query).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    OrderModel.countDocuments(query),
  ]);
  return { data, total, page, limit };
}

export async function kitchenQueue(restaurantId: string) {
  return OrderModel.find({
    restaurantId,
    status: { $in: ['PLACED', 'ACCEPTED', 'PREPARING', 'READY'] },
  })
    .sort({ placedAt: 1 })
    .limit(80)
    .lean();
}

export async function transitionOrder(
  restaurantId: string,
  orderId: string,
  next: OrderStatus,
  actor: Actor,
  opts: { system?: boolean; reason?: string } = {},
) {
  const order = await OrderModel.findOne({ _id: orderId, restaurantId });
  if (!order) throw ApiError.notFound('Order not found');
  if (order.status === next) return order.toObject();
  if (order.status === 'COMPLETED' || order.status === 'CANCELLED') {
    throw ApiError.conflict(`Order is already ${order.status.toLowerCase()}`);
  }
  // A settled bill closes out orders the kitchen never finished; every other path walks the state machine.
  const settlementClose =
    opts.system && next === 'COMPLETED' && ['PLACED', 'ACCEPTED', 'PREPARING'].includes(order.status as OrderStatus);
  if (!settlementClose && !ORDER_TRANSITIONS[order.status as OrderStatus].includes(next)) {
    throw ApiError.conflict(`Cannot move an order from ${order.status} to ${next}`);
  }
  if (!opts.system && !TRANSITION_ROLES[next].includes(actor.role as Role)) {
    throw ApiError.forbidden(`Your role cannot mark an order as ${next.toLowerCase()}`);
  }

  const now = new Date();
  order.status = next;
  order.statusHistory.push({ status: next, at: now, byUserId: (actor.userId ?? null) as unknown as Types.ObjectId });
  if (next === 'ACCEPTED') order.acceptedAt = now;
  if (next === 'READY') order.readyAt = now;
  if (next === 'SERVED') order.servedAt = now;
  if (next === 'COMPLETED') order.completedAt = now;
  if (next === 'CANCELLED') order.cancelReason = opts.reason ?? '';
  await order.save();

  const payload = order.toObject();
  emit.toKitchen(restaurantId, statusEventName(next), payload);
  emit.toRestaurant(restaurantId, Events.ORDER_UPDATED, payload);

  const session = order.tableSessionId
    ? await TableSessionModel.findById(order.tableSessionId).select('publicToken').lean()
    : null;
  if (session) emit.toSession(session.publicToken, statusEventName(next), payload);

  if (order.tableId) {
    const table = await TableModel.findOne({ _id: order.tableId, restaurantId }).lean();
    if (next === 'READY' && table && !['BILL_REQUESTED', 'PAYMENT_PENDING'].includes(table.status)) {
      await setTableStatus(table._id, 'FOOD_READY');
      const readyTitle = `Order ${order.orderNumber} is ready`;
      if (table.assignedWaiterId) {
        await notify({
          restaurantId,
          recipientId: String(table.assignedWaiterId),
          type: 'ORDER_READY',
          title: readyTitle,
          body: `Pick up for table ${table.number}`,
          entityType: 'Order',
          entityId: String(order._id),
        });
        emit.toWaiter(String(table.assignedWaiterId), Events.ORDER_READY, payload);
      } else {
        await notifyRoles(restaurantId, ['WAITER'], {
          type: 'ORDER_READY',
          title: readyTitle,
          body: `Pick up for table ${table.number}`,
          entityType: 'Order',
          entityId: String(order._id),
        });
      }
    }
    if (next === 'SERVED' && table) {
      const others = await OrderModel.countDocuments({
        tableSessionId: order.tableSessionId,
        status: { $in: ['PLACED', 'ACCEPTED', 'PREPARING', 'READY'] },
        _id: { $ne: order._id },
      });
      if (others === 0 && !['BILL_REQUESTED', 'PAYMENT_PENDING'].includes(table.status)) {
        await setTableStatus(table._id, 'OCCUPIED');
      }
    }
    if (next === 'CANCELLED' && table) {
      const others = await OrderModel.countDocuments({
        tableSessionId: order.tableSessionId,
        status: { $nin: ['CANCELLED', 'COMPLETED'] },
        _id: { $ne: order._id },
      });
      if (others === 0 && !['BILL_REQUESTED', 'PAYMENT_PENDING'].includes(table.status)) {
        await setTableStatus(table._id, 'OCCUPIED');
      }
    }
  }

  if (next === 'COMPLETED') {
    await deductForOrder(String(order._id), restaurantId, actor.name || 'System');
  }

  if (next === 'CANCELLED') {
    await recordAudit({
      restaurantId,
      actorId: actor.userId,
      actorName: actor.name,
      action: 'order.cancelled',
      entityType: 'Order',
      entityId: String(order._id),
      metadata: { orderNumber: order.orderNumber, reason: opts.reason ?? '', amount: order.grandTotal },
    });
  }

  return payload;
}

export async function addItemsToOrder(
  restaurantId: string,
  orderId: string,
  items: IncomingItem[],
  actor: Actor,
) {
  const order = await OrderModel.findOne({ _id: orderId, restaurantId });
  if (!order) throw ApiError.notFound('Order not found');
  if (['COMPLETED', 'CANCELLED'].includes(order.status)) {
    throw ApiError.conflict('You cannot add items to a closed order');
  }
  if (order.billId) throw ApiError.conflict('This order has already been billed');

  const restaurant = await RestaurantModel.findById(restaurantId).lean();
  if (!restaurant) throw ApiError.notFound('Restaurant not found');

  const priced = await priceOrderItems({
    restaurantId,
    items,
    serviceChargePercent: 0,
    defaultTaxPercent: restaurant.taxPercent ?? 5,
  });

  const combined: PricedLine[] = [...(order.items as unknown as PricedLine[]), ...priced.items];
  const totals = computeTotals({
    lines: combined,
    discount: order.discountAmount > 0 ? { type: 'FLAT', value: order.discountAmount, note: order.discountNote } : undefined,
    serviceChargePercent: restaurant.serviceChargePercent ?? 0,
  });

  order.items = combined as never;
  order.subtotal = totals.subtotal;
  order.taxTotal = totals.taxTotal;
  order.serviceCharge = totals.serviceCharge;
  order.roundOff = 0;
  order.grandTotal = totals.grandTotal;
  await order.save();

  const payload = order.toObject();
  emit.toKitchen(restaurantId, Events.ORDER_UPDATED, payload);
  emit.toRestaurant(restaurantId, Events.ORDER_UPDATED, payload);
  if (order.tableSessionId) {
    const session = await TableSessionModel.findById(order.tableSessionId).select('publicToken').lean();
    if (session) emit.toSession(session.publicToken, Events.ORDER_UPDATED, payload);
    await touchSession(order.tableSessionId);
  }
  return payload;
}
