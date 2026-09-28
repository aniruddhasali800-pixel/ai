/**
 * The guest's own app: browse the menu without a table, order for pickup or home
 * delivery, and follow the ticket until the rider rings the bell.
 *
 * Everything money-related still happens behind staff counters — this service only
 * ever records what the guest *said* they want to pay with.
 */
import { AddonModel, BillModel, CategoryModel, OrderModel, PaymentModel, ProductModel, RestaurantModel, type Order as OrderRow } from '../models';
import { ApiError } from '../utils/httpError';
import { randomToken } from '../utils/tokens';
import { createOrder, getOrder } from './order.service';
import { createBill, startOnlinePayment } from './billing.service';
import { captureMockPayment } from './mockCapture';
import type { Fulfilment, OrderPaymentMode } from '../types/constants';
import type { IncomingItem } from './pricing.service';

const SYSTEM_ACTOR = { userId: null, role: 'SYSTEM' as const, name: 'Guest app' };

/** The menu as a guest sees it, stripped of costs, recipes and internal flags. */
export async function publicMenu(restaurantId: string) {
  const [restaurant, categories, products, addons] = await Promise.all([
    RestaurantModel.findById(restaurantId).lean(),
    CategoryModel.find({ restaurantId, isActive: true }).sort({ sortOrder: 1, name: 1 }).lean(),
    ProductModel.find({ restaurantId, isActive: true }).sort({ sortOrder: 1, name: 1 }).lean(),
    AddonModel.find({ restaurantId, isActive: true }).sort({ name: 1 }).lean(),
  ]);
  if (!restaurant) throw ApiError.notFound('Restaurant not found');

  return {
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
      deliveryEnabled: restaurant.settings?.deliveryEnabled ?? true,
      bookingEnabled: restaurant.settings?.bookingEnabled ?? true,
      taxPercent: restaurant.taxPercent,
      serviceChargePercent: restaurant.serviceChargePercent,
    },
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
  };
}

export async function restaurantBySlug(slug: string) {
  const restaurant = await RestaurantModel.findOne({ slug: slug.toLowerCase() }).lean();
  if (!restaurant) throw ApiError.notFound('Restaurant not found');
  return restaurant;
}

/** Kitchens a guest can open from the installed app — branding only, no internals. */
export async function listAppRestaurants() {
  const restaurants = await RestaurantModel.find({})
    .select('name slug address.city address.line1 branding currency settings.acceptingOrders')
    .sort({ name: 1 })
    .lean();
  return restaurants.map((r) => ({
    name: r.name,
    slug: r.slug,
    city: r.address?.city ?? '',
    line1: r.address?.line1 ?? '',
    tagline: r.branding?.tagline ?? '',
    logoUrl: r.branding?.logoUrl ?? '',
    currency: r.currency,
    acceptingOrders: r.settings?.acceptingOrders ?? true,
  }));
}

/** A tracked link is the only thing a guest gets back from the ordering call. */
export async function placeAppOrder(opts: {
  restaurantId: string;
  fulfilment: Fulfilment;
  paymentMode: OrderPaymentMode;
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  customerCity: string;
  notes?: string;
  items: IncomingItem[];
}) {
  const restaurant = await RestaurantModel.findById(opts.restaurantId).lean();
  if (!restaurant) throw ApiError.notFound('Restaurant not found');
  if (opts.fulfilment === 'DELIVERY' && !(restaurant.settings?.deliveryEnabled ?? true)) {
    throw ApiError.conflict('Home delivery is paused at this restaurant right now');
  }
  if (opts.fulfilment === 'DELIVERY' && !opts.customerAddress.trim()) {
    throw ApiError.badRequest('Home delivery needs an address to ride to');
  }

  const order = await createOrder({
    restaurantId: opts.restaurantId,
    source: 'CUSTOMER_APP',
    actor: SYSTEM_ACTOR,
    fulfilment: opts.fulfilment,
    paymentMode: opts.paymentMode,
    trackingToken: randomToken(16),
    customerName: opts.customerName,
    customerPhone: opts.customerPhone,
    customerAddress: opts.customerAddress,
    customerCity: opts.customerCity,
    notes: opts.notes,
    items: opts.items,
  });

  // Prepaid tickets are billed on the spot so the guest can scan and pay from the
  // phone; cash-on-delivery stays unbilled until the money is actually in the drawer.
  const bill =
    opts.paymentMode === 'CASH_ON_DELIVERY'
      ? null
      : await createBill({ restaurantId: opts.restaurantId, actor: SYSTEM_ACTOR, orderId: String(order._id) });

  return { order, bill, restaurant: { name: restaurant.name, currency: restaurant.currency } };
}

/** The guest's card intent: a pending payment on the gateway, never a frontend stamp. */
export async function startAppCheckout(trackingToken: string, method: 'CARD' | 'UPI') {
  const order = await OrderModel.findOne({ trackingToken }).lean();
  if (!order) throw ApiError.notFound('We cannot find that order');
  if (!order.billId) throw ApiError.conflict('This order is settled on delivery, so there is nothing to pay here');

  const bill = await BillModel.findById(order.billId).lean();
  if (!bill) throw ApiError.notFound('Bill not found');
  if (bill.paymentStatus === 'PAID') throw ApiError.conflict('This bill is already paid');

  // Tapping "pay" twice must not open two checkouts on the same bill.
  const waiting = await PaymentModel.findOne({ billId: bill._id, status: 'PENDING', method }).lean();
  if (waiting) return waiting;

  return startOnlinePayment({
    restaurantId: String(order.restaurantId),
    billId: String(bill._id),
    actor: SYSTEM_ACTOR,
    method,
  });
}

/**
 * The sandbox gateway completing its own checkout. The tracking token is the whole
 * capability: it only reaches a pending payment on this order's bill, only the MOCK
 * provider qualifies, and the capture runs through the signed webhook path — the same
 * door a real bank callback comes through. A guest tap still cannot print money.
 */
export async function confirmAppCheckout(trackingToken: string) {
  const order = await OrderModel.findOne({ trackingToken }).select('billId restaurantId').lean();
  if (!order) throw ApiError.notFound('We cannot find that order');
  if (!order.billId) throw ApiError.conflict('Nothing is billed on this order yet');

  const waiting = await PaymentModel.findOne({ billId: order.billId, status: 'PENDING' }).sort({ createdAt: -1 }).lean();
  if (!waiting) throw ApiError.conflict('There is no checkout waiting on this order');

  await captureMockPayment({ providerOrderId: waiting.providerOrderId ?? '', provider: waiting.provider });
  const payment = await PaymentModel.findById(waiting._id).lean();
  const bill = await BillModel.findById(order.billId).select('paymentStatus grandTotal').lean();
  return { payment, bill };
}

/** What the tracking screen is allowed to see about its own order. */
export function guestTicketView(
  order: OrderRow,
  bill?: { publicToken: string; billNumber: string; grandTotal: number } | null,
) {
  return {
    orderNumber: order.orderNumber,
    status: order.status,
    fulfilment: order.fulfilment,
    paymentMode: order.paymentMode,
    paymentStatus: order.paymentStatus,
    riderName: order.riderName ?? '',
    customerName: order.customerName,
    customerAddress: order.customerAddress,
    customerCity: order.customerCity,
    items: order.items,
    subtotal: order.subtotal,
    taxTotal: order.taxTotal,
    serviceCharge: order.serviceCharge,
    grandTotal: order.grandTotal,
    placedAt: order.placedAt,
    acceptedAt: order.acceptedAt,
    readyAt: order.readyAt,
    servedAt: order.servedAt,
    completedAt: order.completedAt,
    statusHistory: order.statusHistory,
    bill: bill ? { publicToken: bill.publicToken, billNumber: bill.billNumber, grandTotal: bill.grandTotal } : null,
  };
}

export async function appOrderView(trackingToken: string) {
  // getOrder is staff-scoped; the guest only ever holds the tracking token, so the
  // tenant id comes from the order itself and nothing else is reachable from here.
  const found = await OrderModel.findOne({ trackingToken }).lean();
  if (!found) throw ApiError.notFound('We cannot find that order');
  const [order, bill, restaurant] = await Promise.all([
    getOrder(String(found.restaurantId), String(found._id)),
    found.billId ? BillModel.findById(found.billId).select('publicToken billNumber grandTotal').lean() : null,
    RestaurantModel.findById(found.restaurantId).select('name currency').lean(),
  ]);

  return {
    ...guestTicketView(
      order as unknown as OrderRow,
      bill ? { publicToken: bill.publicToken ?? '', billNumber: bill.billNumber, grandTotal: bill.grandTotal } : null,
    ),
    restaurant: restaurant ? { name: restaurant.name, currency: restaurant.currency } : null,
  };
}
