import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { connectTestDb, disconnectTestDb, makeDiner, resetDb } from './helpers';
import { RestaurantModel } from '../src/models';
import { appOrderView, confirmAppCheckout, placeAppOrder, startAppCheckout } from '../src/services/customerApp.service';

beforeEach(async () => {
  await connectTestDb();
  await resetDb();
});
afterAll(disconnectTestDb);

const guest = {
  customerName: 'Aarav Shah',
  customerPhone: '+91 90045 77881',
  customerAddress: '204 Sadashiv Chambers, Baner Road',
  customerCity: 'Pune',
};

describe('the guest ordering app', () => {
  it('puts a delivery ticket in the kitchen with its own private link', async () => {
    const diner = await makeDiner();
    const { order, bill } = await placeAppOrder({
      restaurantId: diner.restaurantId,
      fulfilment: 'DELIVERY',
      paymentMode: 'CASH_ON_DELIVERY',
      ...guest,
      items: [{ productId: diner.mainsProductId, qty: 2 }],
    });

    expect(order.source).toBe('CUSTOMER_APP');
    expect(order.fulfilment).toBe('DELIVERY');
    expect(order.paymentMode).toBe('CASH_ON_DELIVERY');
    expect(order.paymentStatus).toBe('UNPAID');
    expect(order.trackingToken?.length).toBeGreaterThan(16);
    // Cash at the door is not money in the drawer yet, so nothing is billed.
    expect(bill).toBeNull();

    const view = await appOrderView(order.trackingToken ?? '');
    expect(view.orderNumber).toBe(order.orderNumber);
    expect(view.riderName).toBe('');
    expect(view.restaurant?.name).toBe('Test Bistro');
    expect(view.items[0]).toMatchObject({ name: 'Butter Chicken', qty: 2 });
  });

  it('refuses a delivery with nowhere to ride, and honours a paused service area', async () => {
    const diner = await makeDiner();
    await expect(
      placeAppOrder({
        restaurantId: diner.restaurantId,
        fulfilment: 'DELIVERY',
        paymentMode: 'CASH_ON_DELIVERY',
        ...guest,
        customerAddress: '   ',
        items: [{ productId: diner.colaProductId, qty: 1 }],
      }),
    ).rejects.toThrow(/needs an address/);

    await RestaurantModel.updateOne({ _id: diner.restaurantId }, { 'settings.deliveryEnabled': false });
    await expect(
      placeAppOrder({
        restaurantId: diner.restaurantId,
        fulfilment: 'DELIVERY',
        paymentMode: 'UPI',
        ...guest,
        items: [{ productId: diner.colaProductId, qty: 1 }],
      }),
    ).rejects.toThrow(/delivery is paused/);
  });

  it('settles a card intent only through the signed webhook path', async () => {
    const diner = await makeDiner();
    const { order, bill } = await placeAppOrder({
      restaurantId: diner.restaurantId,
      fulfilment: 'PICKUP',
      paymentMode: 'CARD',
      ...guest,
      customerAddress: '',
      items: [{ productId: diner.colaProductId, qty: 2 }],
    });
    expect(bill).not.toBeNull();
    const token = order.trackingToken ?? '';

    const first = await startAppCheckout(token, 'CARD');
    const again = await startAppCheckout(token, 'CARD');
    expect(first.status).toBe('PENDING');
    // Two taps on "pay" are one checkout, not two charges on the same bill.
    expect(String(again._id)).toBe(String(first._id));

    const { payment, bill: settled } = await confirmAppCheckout(token);
    expect(payment?.status).toBe('SUCCEEDED');
    expect(settled?.paymentStatus).toBe('PAID');

    const view = await appOrderView(token);
    expect(view.paymentStatus).toBe('PAID');
    await expect(startAppCheckout(token, 'CARD')).rejects.toThrow(/already paid/);
  });

  it('has nothing to capture on a ticket that was never billed', async () => {
    const diner = await makeDiner();
    const { order } = await placeAppOrder({
      restaurantId: diner.restaurantId,
      fulfilment: 'PICKUP',
      paymentMode: 'CASH_ON_DELIVERY',
      ...guest,
      customerAddress: '',
      items: [{ productId: diner.colaProductId, qty: 1 }],
    });

    await expect(confirmAppCheckout(order.trackingToken ?? '')).rejects.toThrow(/nothing is billed/i);
    await expect(appOrderView('not-a-real-token')).rejects.toThrow(/cannot find that order/i);
  });
});
