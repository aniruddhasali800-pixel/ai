/**
 * One entry point for every code the business prints: the sticker on a table, the bill
 * at the counter, the tracking link on a bag, the storefront QR on the door.
 *
 * The scanner never decides what a user may see. The token is looked up inside the
 * caller's own restaurant and the destination is chosen from the caller's role, so a
 * cook who points a camera at a bill lands in the kitchen, not at the till.
 */
import {
  BillModel,
  OrderModel,
  RestaurantModel,
  TableModel,
  TableSessionModel,
} from '../models';
import { ApiError } from '../utils/httpError';
import { roleHasPermission, type Role } from '../types/constants';

export type ScanKind = 'TABLE' | 'SESSION' | 'ORDER' | 'BILL' | 'RESTAURANT';

/** The few fields of each document the scanner reads, so lean() results drop straight in. */
interface ScanTable {
  _id: unknown;
  number: string;
  section: string;
  capacity: number;
  status: string;
  activeSessionId?: unknown;
}
interface ScanOrder {
  _id: unknown;
  orderNumber: string;
  status: string;
  grandTotal: number;
  paymentStatus: string;
  items: { qty: number }[];
  tableId?: unknown;
  tableSessionId?: unknown;
  customerName?: string;
  riderName?: string;
  fulfilment?: string;
}
interface ScanBill {
  _id: unknown;
  billNumber: string;
  grandTotal: number;
  paymentStatus: string;
  tableNumber?: string;
  customerName?: string;
}

export interface ResolvedScan {
  kind: ScanKind;
  /** The document the client can re-fetch or highlight. */
  id: string;
  headline: string;
  note: string;
  status: string;
  amount?: number;
  /** Where this code takes *this* role. Computed on the server, never sent by the browser. */
  href: string;
  /** Secondary destinations the role is allowed to open for the same object. */
  links: { label: string; href: string }[];
}

/** Every token we print is a path segment, so a scanned URL and a typed code resolve alike. */
function candidateOf(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('upi://')) {
    // A UPI charge carries the bill reference in its transaction note.
    const note = new URLSearchParams(trimmed.slice(trimmed.indexOf('?') + 1)).get('tn') ?? '';
    return note.trim();
  }
  const path = trimmed.split('?')[0].split('#')[0].replace(/\/+$/, '');
  const last = path.split('/').pop() ?? '';
  return last.trim();
}

function sameTenant(foundRestaurantId: unknown, callerRestaurantId: string, name: string) {
  if (String(foundRestaurantId) === callerRestaurantId) return true;
  throw ApiError.conflict(`That ${name} belongs to a different restaurant than the one you are signed in to`);
}

const maySeeFloor = (role: Role) => roleHasPermission(role, 'tables:read') || roleHasPermission(role, 'kitchen:operate');

/**
 * Each role gets a link its own screen can act on: the pass filters to the table, the
 * till searches it, the waiter starts ringing it in, the owner finds it on the floor.
 */
function tableHref(role: Role, tableId: string, tableNumber: string, seated: boolean): string {
  const where = encodeURIComponent(tableNumber);
  if (role === 'KITCHEN') return seated ? `/kds?table=${where}` : '/kds';
  if (role === 'CASHIER') return seated ? `/pos?search=${where}` : '/pos';
  if (role === 'WAITER') return `/floor/order?table=${tableId}`;
  return `/app/tables?table=${tableId}`;
}

async function describeTable(table: ScanTable, role: Role): Promise<ResolvedScan> {
  const session = table.activeSessionId
    ? await TableSessionModel.findOne({ _id: table.activeSessionId, status: { $ne: 'CLOSED' } }).lean()
    : null;
  const sessionToken = session ? String(session.publicToken) : null;
  const openOrders = session
    ? await OrderModel.find({ tableSessionId: session._id, status: { $ne: 'CANCELLED' } })
        .select('grandTotal')
        .lean()
    : [];
  const running = openOrders.reduce((sum, o) => sum + o.grandTotal, 0);

  const links: { label: string; href: string }[] = [];
  if (roleHasPermission(role, 'tables:read')) links.push({ label: 'Floor map', href: '/floor/map' });
  if (roleHasPermission(role, 'orders:write') && sessionToken) {
    links.push({ label: 'Add another round', href: `/floor/order?table=${String(table._id)}` });
  }
  if (roleHasPermission(role, 'billing:read') && sessionToken) links.push({ label: 'At the counter', href: '/pos' });

  return {
    kind: 'TABLE',
    id: String(table._id),
    headline: `Table ${table.number}`,
    note: session
      ? `${session.guestCount} seated${session.customerName ? ` · ${session.customerName}` : ''} · ${openOrders.length} ticket${openOrders.length === 1 ? '' : 's'} running`
      : table.status === 'CLEANING'
        ? 'Being cleared — seat nobody yet'
        : `Free · seats ${table.capacity} · ${table.section}`,
    status: table.status,
    amount: running || undefined,
    href: tableHref(role, String(table._id), table.number, Boolean(session)),
    links,
  };
}

async function describeOrder(order: ScanOrder, role: Role): Promise<ResolvedScan> {
  const [table, session] = await Promise.all([
    order.tableId ? TableModel.findById(order.tableId).select('number').lean() : null,
    order.tableSessionId ? TableSessionModel.findById(order.tableSessionId).select('publicToken').lean() : null,
  ]);
  const items = order.items.reduce((n, i) => n + i.qty, 0);
  const who = table ? `Table ${table.number}` : order.customerName || order.riderName || (order.fulfilment ?? 'takeaway').toLowerCase();

  const links: { label: string; href: string }[] = [];
  if (roleHasPermission(role, 'kitchen:operate')) links.push({ label: 'On the kitchen display', href: '/kds' });
  if (roleHasPermission(role, 'billing:read')) links.push({ label: 'Bills', href: '/pos' });

  return {
    kind: 'ORDER',
    id: String(order._id),
    headline: order.orderNumber,
    note: `${items} item${items === 1 ? '' : 's'} · ${who}${order.paymentStatus === 'PAID' ? ' · paid' : ''}`,
    status: order.status,
    amount: order.grandTotal,
    href: role === 'KITCHEN' ? `/kds?order=${String(order._id)}` : `/app/orders/${String(order._id)}`,
    links,
  };
}

function describeBill(bill: ScanBill, role: Role): ResolvedScan {
  const links: { label: string; href: string }[] = [];
  if (roleHasPermission(role, 'orders:read')) links.push({ label: 'Orders', href: '/app/orders' });

  return {
    kind: 'BILL',
    id: String(bill._id),
    headline: bill.billNumber,
    note: `${bill.tableNumber ? `Table ${bill.tableNumber} · ` : ''}${bill.customerName || 'Guest'} · ${
      bill.paymentStatus === 'PAID' ? 'settled' : bill.paymentStatus === 'REFUNDED' ? 'refunded' : 'awaiting payment'
    }`,
    status: bill.paymentStatus,
    amount: bill.grandTotal,
    href: `/pos?bill=${String(bill._id)}`,
    links,
  };
}

/** The destination is a decision about the caller, so it lives next to the permission map. */
export async function resolveScannedCode(
  restaurantId: string,
  role: Role,
  raw: string,
): Promise<ResolvedScan> {
  const candidate = candidateOf(raw);
  if (!candidate) throw ApiError.badRequest('Nothing to read in that code');

  // 1. A table sticker — or the number printed under it, which is what a waiter types.
  const table =
    (await TableModel.findOne({ qrToken: candidate }).lean()) ??
    (/^[A-Z]{1,3}\d{1,4}$/i.test(candidate)
      ? await TableModel.findOne({ restaurantId, number: candidate.toUpperCase() }).lean()
      : null);
  if (table) {
    sameTenant(table.restaurantId, restaurantId, 'table code');
    if (!maySeeFloor(role)) throw ApiError.forbidden();
    return describeTable(table, role);
  }

  // 2. The live link printed on a guest's own ticket.
  const order = await OrderModel.findOne({ trackingToken: candidate }).lean();
  if (order) {
    sameTenant(order.restaurantId, restaurantId, 'order code');
    if (!roleHasPermission(role, 'orders:read')) throw ApiError.forbidden();
    return describeOrder(order, role);
  }
  // Order numbers are typed as often as they are scanned, once the code is smudged.
  if (/^[A-Z]{1,3}-\d{1,5}$/i.test(candidate)) {
    const byNumber = await OrderModel.findOne({ restaurantId, orderNumber: candidate.toUpperCase() }).lean();
    if (byNumber) {
      if (!roleHasPermission(role, 'orders:read')) throw ApiError.forbidden();
      return describeOrder(byNumber, role);
    }
  }

  // 3. A bill — the till's business only.
  const bill = await BillModel.findOne({ publicToken: candidate }).lean();
  if (bill) {
    sameTenant(bill.restaurantId, restaurantId, 'bill code');
    if (!roleHasPermission(role, 'billing:read')) {
      throw ApiError.forbidden('That is a bill code. The counter handles it — ask a cashier to scan it.');
    }
    return describeBill(bill, role);
  }
  if (/^INV-\d{8}-\d{4}$/.test(candidate)) {
    const byNumber = await BillModel.findOne({ restaurantId, billNumber: candidate }).lean();
    if (byNumber) {
      if (!roleHasPermission(role, 'billing:read')) throw ApiError.forbidden('That is a bill code — the counter handles it.');
      return describeBill(byNumber, role);
    }
  }

  // 4. A table session link (the guest's "show this to your waiter" screen).
  const session = await TableSessionModel.findOne({ publicToken: candidate }).lean();
  if (session) {
    sameTenant(session.restaurantId, restaurantId, 'session code');
    if (!maySeeFloor(role)) throw ApiError.forbidden();
    const seated = await TableModel.findOne({ _id: session.tableId, restaurantId }).lean();
    if (!seated) throw ApiError.notFound('That table is gone from the floor');
    const described = await describeTable(seated, role);
    return { ...described, kind: 'SESSION', headline: `${described.headline} · live session`, status: session.status };
  }

  // 5. The storefront code that installs the guest app.
  const restaurant = await RestaurantModel.findOne({ slug: candidate.toLowerCase() }).lean();
  if (restaurant) {
    sameTenant(restaurant._id, restaurantId, 'restaurant code');
    return {
      kind: 'RESTAURANT',
      id: String(restaurant._id),
      headline: restaurant.name,
      note: `${restaurant.slug} · the guest ordering app${restaurant.settings?.acceptingOrders === false ? ' · paused' : ''}`,
      status: restaurant.settings?.acceptingOrders === false ? 'PAUSED' : 'OPEN',
      href: roleHasPermission(role, 'settings:write') ? '/app/settings' : `/eat/${restaurant.slug}`,
      links: [
        { label: 'Open the guest app', href: `/eat/${restaurant.slug}` },
        ...(roleHasPermission(role, 'settings:write') ? [{ label: 'Print the sticker', href: '/app/settings' }] : []),
      ],
    };
  }

  throw ApiError.notFound('We could not match that code to a table, ticket, bill or sticker from your restaurant');
}
