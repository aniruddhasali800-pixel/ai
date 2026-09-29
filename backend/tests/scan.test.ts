import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { connectTestDb, disconnectTestDb, makeDiner, resetDb, makeRestaurant, actor } from './helpers';
import { resolveScannedCode } from '../src/services/scan.service';
import { openSession } from '../src/services/table.service';
import { createOrder } from '../src/services/order.service';
import { createBill } from '../src/services/billing.service';
import { RestaurantModel, TableModel } from '../src/models';
import { ApiError } from '../src/utils/httpError';

beforeEach(async () => {
  await connectTestDb();
  await resetDb();
});
afterAll(disconnectTestDb);

/** Seats the small table and hands back the sticker token a guest would scan. */
async function scanTable(diner: Awaited<ReturnType<typeof makeDiner>>) {
  const session = await openSession({ restaurantId: diner.restaurantId, tableId: diner.smallTableId, guestCount: 2 });
  const seated = await TableModel.findById(diner.smallTableId).lean();
  return { session, token: String(seated?.qrToken) };
}

describe('scanning a table sticker', () => {
  it('sends every role to their own work, not to a shared screen', async () => {
    const diner = await makeDiner();
    const { token } = await scanTable(diner);
    const small = diner.smallTableId;

    const owner = await resolveScannedCode(diner.restaurantId, 'OWNER', `http://localhost:4000/t/${token}`);
    expect(owner).toMatchObject({ kind: 'TABLE', headline: 'Table S1', status: 'OCCUPIED', id: small });
    expect(owner.href).toBe(`/app/tables?table=${small}`);

    const waiter = await resolveScannedCode(diner.restaurantId, 'WAITER', token);
    expect(waiter.href).toBe(`/floor/order?table=${small}`);

    const cashier = await resolveScannedCode(diner.restaurantId, 'CASHIER', token);
    expect(cashier.href).toBe('/pos?search=S1');

    const kitchen = await resolveScannedCode(diner.restaurantId, 'KITCHEN', token);
    expect(kitchen.href).toBe('/kds?table=S1');
  });

  it('sends the pass and the till to the plain boards when nobody is seated', async () => {
    const diner = await makeDiner();
    const free = await TableModel.findOne({ restaurantId: diner.restaurantId, status: 'AVAILABLE' }).lean();
    const token = String(free?.qrToken);

    expect((await resolveScannedCode(diner.restaurantId, 'KITCHEN', token)).href).toBe('/kds');
    expect((await resolveScannedCode(diner.restaurantId, 'CASHIER', token)).href).toBe('/pos');
  });

  it('reports who is sitting there and what the table has spent', async () => {
    const diner = await makeDiner();
    const { token, session } = await scanTable(diner);
    await createOrder({
      restaurantId: diner.restaurantId,
      source: 'DINE_IN_QR',
      tableId: diner.smallTableId,
      tableSessionId: String(session._id),
      items: [{ productId: diner.mainsProductId, qty: 1 }],
    });

    const scan = await resolveScannedCode(diner.restaurantId, 'MANAGER', token);
    expect(scan.note).toContain('2 seated');
    expect(scan.note).toContain('1 ticket running');
    expect(scan.amount).toBe(352);
  });

  it('finds the table from the number printed under the sticker, too', async () => {
    const diner = await makeDiner();
    await scanTable(diner);

    const waiter = await resolveScannedCode(diner.restaurantId, 'WAITER', 's1');
    expect(waiter).toMatchObject({ kind: 'TABLE', headline: 'Table S1', status: 'OCCUPIED' });
    expect(waiter.href).toBe(`/floor/order?table=${diner.smallTableId}`);
  });

  it('refuses a code printed by another restaurant', async () => {
    const diner = await makeDiner();
    const { token } = await scanTable(diner);
    const other = await makeRestaurant();

    await expect(resolveScannedCode(String(other.restaurant._id), 'OWNER', token)).rejects.toThrow(/different restaurant/);
  });

  it('says so when the code matches nothing', async () => {
    const diner = await makeDiner();
    await expect(resolveScannedCode(diner.restaurantId, 'OWNER', 'totally-made-up-code')).rejects.toThrow(/could not match/);
  });
});

describe('scanning a bill', () => {
  it('opens the counter for the till and refuses the floor', async () => {
    const diner = await makeDiner();
    const order = await createOrder({
      restaurantId: diner.restaurantId,
      source: 'DINE_IN_WAITER',
      items: [{ productId: diner.mainsProductId, qty: 1 }],
      actor: actor(diner.waiterId, 'WAITER', 'Sneha'),
    });
    const bill = await createBill({ restaurantId: diner.restaurantId, actor: actor(diner.cashierId, 'CASHIER', 'Rohit'), orderId: String(order._id) });

    const cashier = await resolveScannedCode(diner.restaurantId, 'CASHIER', bill.publicToken ?? '');
    expect(cashier).toMatchObject({ kind: 'BILL', headline: bill.billNumber, amount: 352 });
    expect(cashier.href).toBe(`/pos?bill=${bill._id}`);

    // A waiter may raise and read a bill, so the counter is a legitimate stop for them.
    const waiter = await resolveScannedCode(diner.restaurantId, 'WAITER', String(bill.publicToken));
    expect(waiter.kind).toBe('BILL');
    expect(waiter.links.map((l) => l.href)).not.toContain('/app/audit');

    // The kitchen never touches money, and the scan answer says so in guest-facing words.
    await expect(resolveScannedCode(diner.restaurantId, 'KITCHEN', String(bill.publicToken))).rejects.toThrow(/bill code/);
  });

  it('resolves a UPI charge, whose only reference is the transaction note', async () => {
    const diner = await makeDiner();
    const order = await createOrder({
      restaurantId: diner.restaurantId,
      source: 'CASHIER',
      items: [{ productId: diner.colaProductId, qty: 1 }],
    });
    const bill = await createBill({ restaurantId: diner.restaurantId, actor: actor(diner.cashierId, 'CASHIER', 'Rohit'), orderId: String(order._id) });

    const link = `upi://pay?pa=hotel@icici&pn=Saffron%20%26%20Smoke&am=94.50&cu=INR&tn=${bill.billNumber}`;
    const scan = await resolveScannedCode(diner.restaurantId, 'CASHIER', link);
    expect(scan.headline).toBe(bill.billNumber);
    expect(scan.status).toBe('UNPAID');
  });
});

describe('scanning a ticket', () => {
  it('routes a tracking link by role', async () => {
    const diner = await makeDiner();
    const order = await createOrder({
      restaurantId: diner.restaurantId,
      source: 'CUSTOMER_APP',
      fulfilment: 'DELIVERY',
      paymentMode: 'CASH_ON_DELIVERY',
      trackingToken: 'a'.repeat(22),
      customerName: 'Isha',
      items: [{ productId: diner.mainsProductId, qty: 2 }],
    });

    const owner = await resolveScannedCode(diner.restaurantId, 'OWNER', `https://demo.vercel.app/track/${order.trackingToken}`);
    expect(owner).toMatchObject({ kind: 'ORDER', headline: order.orderNumber, amount: 704 });
    expect(owner.href).toBe(`/app/orders/${order._id}`);

    const kitchen = await resolveScannedCode(diner.restaurantId, 'KITCHEN', String(order.trackingToken));
    expect(kitchen.href).toBe(`/kds?order=${order._id}`);
    expect(kitchen.note).toContain('2 items');
  });

  it('finds a ticket typed in by number, because stickers smudge', async () => {
    const diner = await makeDiner();
    const order = await createOrder({
      restaurantId: diner.restaurantId,
      source: 'DINE_IN_WAITER',
      items: [{ productId: diner.colaProductId, qty: 1 }],
    });

    const scan = await resolveScannedCode(diner.restaurantId, 'MANAGER', order.orderNumber.toLowerCase());
    expect(scan.kind).toBe('ORDER');
    expect(scan.headline).toBe(order.orderNumber);
  });

  it('will not hand a kitchen-only account a bill it cannot settle', async () => {
    const diner = await makeDiner();
    const order = await createOrder({
      restaurantId: diner.restaurantId,
      source: 'CUSTOMER_APP',
      fulfilment: 'PICKUP',
      paymentMode: 'CARD',
      trackingToken: 'b'.repeat(22),
      items: [{ productId: diner.colaProductId, qty: 1 }],
    });
    const scan = await resolveScannedCode(diner.restaurantId, 'KITCHEN', String(order.trackingToken));
    expect(scan.links.map((l) => l.href)).not.toContain('/pos');
  });
});

describe('scanning the storefront sticker', () => {
  it('gives the owner the print page and everyone else the guest app', async () => {
    const diner = await makeDiner();
    const slug = String((await RestaurantModel.findById(diner.restaurantId).lean())?.slug);

    const owner = await resolveScannedCode(diner.restaurantId, 'OWNER', `https://demo.vercel.app/eat/${slug}`);
    expect(owner).toMatchObject({ kind: 'RESTAURANT', status: 'OPEN' });
    expect(owner.href).toBe('/app/settings');

    const waiter = await resolveScannedCode(diner.restaurantId, 'WAITER', slug);
    expect(waiter.href).toBe(`/eat/${slug}`);
  });
});
