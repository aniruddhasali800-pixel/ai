import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { connectTestDb, disconnectTestDb, makeDiner, makeProduct, actor, resetDb } from './helpers';
import { OrderModel, TableModel, TableSessionModel } from '../src/models';
import { createOrder, kitchenQueue } from '../src/services/order.service';
import { openSession } from '../src/services/table.service';
import { createBill, recordCashPayment } from '../src/services/billing.service';
import { roleHasPermission } from '../src/types/constants';
import { round2 } from '../src/utils/money';

beforeEach(async () => {
  await connectTestDb();
  await resetDb();
});
afterAll(disconnectTestDb);

const guest = { userId: null, role: 'SYSTEM' as const, name: 'Guest request' };

async function seatedTable(diner: Awaited<ReturnType<typeof makeDiner>>) {
  const session = await openSession({
    restaurantId: diner.restaurantId,
    tableId: diner.smallTableId,
    guestCount: 3,
    customerName: 'Guest party',
    via: 'QR',
  });
  return session;
}

async function dineIn(diner: Awaited<ReturnType<typeof makeDiner>>, session: { _id: unknown }, productId: string, qty: number) {
  return createOrder({
    restaurantId: diner.restaurantId,
    source: 'DINE_IN_QR',
    tableId: diner.smallTableId,
    tableSessionId: String(session._id),
    actor: guest,
    items: [{ productId, qty }],
  });
}

describe('one bill per table', () => {
  it('combines every order the table has run into a single bill', async () => {
    const diner = await makeDiner();
    const session = await seatedTable(diner);
    const first = await dineIn(diner, session, diner.mainsProductId, 1);
    const second = await dineIn(diner, session, diner.colaProductId, 2);

    const bill = await createBill({ restaurantId: diner.restaurantId, actor: guest, sessionId: String(session._id) });

    expect(bill.orderIds.map(String).sort()).toEqual([String(first._id), String(second._id)].sort());
    expect(bill.subtotal).toBe(round2(first.subtotal + second.subtotal));
    expect(bill.tableNumber).toBe('S1');

    const orders = await OrderModel.find({ _id: { $in: bill.orderIds } }).lean();
    expect(orders.every((o) => String(o.billId) === String(bill._id))).toBe(true);

    // A second tap on the same table must not print a second total.
    const again = await createBill({ restaurantId: diner.restaurantId, actor: guest, sessionId: String(session._id) });
    expect(String(again._id)).toBe(String(bill._id));
  });

  it('keeps veg and non-veg apart on the lines the pass and the bill read', async () => {
    const diner = await makeDiner();
    const paneer = await makeProduct(diner.restaurantId, diner.categoryId, { name: 'Paneer Tikka', price: 260 });
    const session = await seatedTable(diner);

    const order = await createOrder({
      restaurantId: diner.restaurantId,
      source: 'DINE_IN_QR',
      tableId: diner.smallTableId,
      tableSessionId: String(session._id),
      actor: guest,
      items: [
        { productId: diner.mainsProductId, qty: 1 },
        { productId: String(paneer._id), qty: 1 },
      ],
    });

    expect(order.items.map((i) => i.isVeg)).toEqual([false, true]);

    const [ticket] = await kitchenQueue(diner.restaurantId);
    expect(ticket.tableNumber).toBe('S1');
  });
});

describe('cash handed over at the table', () => {
  it('lets a waiter bill the table but never confirm the money', () => {
    expect(roleHasPermission('WAITER', 'billing:write')).toBe(true);
    expect(roleHasPermission('WAITER', 'requests:write')).toBe(true);
    expect(roleHasPermission('WAITER', 'payments:write')).toBe(false);
    expect(roleHasPermission('CASHIER', 'payments:write')).toBe(true);
  });

  it('settles on the counted notes, returns change and sends the table to cleaning', async () => {
    const diner = await makeDiner();
    const session = await seatedTable(diner);
    await dineIn(diner, session, diner.mainsProductId, 1);
    const bill = await createBill({ restaurantId: diner.restaurantId, actor: guest, sessionId: String(session._id) });

    const settled = await recordCashPayment({
      restaurantId: diner.restaurantId,
      billId: String(bill._id),
      actor: actor(diner.cashierId, 'CASHIER', 'Rohit'),
      tendered: bill.grandTotal + 300,
      note: 'Collected at the table by the waiter',
    });

    expect(settled.payment.method).toBe('CASH');
    expect(settled.payment.change).toBe(300);
    expect(settled.bill?.paymentStatus).toBe('PAID');

    const closedSession = await TableSessionModel.findById(session._id).lean();
    expect(closedSession?.status).toBe('CLOSED');
    const table = await TableModel.findById(diner.smallTableId).lean();
    expect(table?.status).toBe('CLEANING');

    const orders = await OrderModel.find({ _id: { $in: bill.orderIds } }).lean();
    expect(orders.every((o) => o.status === 'COMPLETED' && o.paymentStatus === 'PAID')).toBe(true);
  });
});
