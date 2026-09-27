import { useEffect } from 'react';
import { useRealtimeEvent } from '../lib/socket';
import { invalidate, invalidateMany } from '../lib/query';
import { useNotifications } from '../store/notifications';
import { useToasts } from '../store/toasts';
import { useAuth } from '../store/auth';
import { inr } from '../lib/format';
import type { AppNotification, Order } from '../lib/types';

/**
 * One place that turns backend socket events into cache invalidations and toast
 * pings, so every open screen repaints the moment anything changes anywhere.
 */
export function useRealtimeShell() {
  const receive = useNotifications((s) => s.receive);
  const push = useToasts((s) => s.push);
  const role = useAuth((s) => s.user?.role);
  const userId = useAuth((s) => s.user?._id);

  useRealtimeEvent<AppNotification>('notification:new', (n) => {
    if (!n || !('_id' in n)) return;
    receive(n);
    const tone = n.type === 'PAYMENT_FAILED' || n.type === 'LOW_STOCK' ? 'error' : 'event';
    push({ kind: tone, title: n.title, body: n.body });
  });

  const onOrder = (o: Order) => {
    invalidateMany(['orders', 'kds', 'floor', 'reports', 'dashboard']);
    if (!o?.orderNumber) return;
    // Only ping the roles that actually act on the ticket.
    if (role === 'KITCHEN' && o.status === 'PLACED') push({ kind: 'event', title: `New ticket ${o.orderNumber}`, body: `${o.items.length} item(s)` });
  };
  useRealtimeEvent('order.created', onOrder);
  useRealtimeEvent('order.accepted', onOrder);
  useRealtimeEvent('order.preparing', onOrder);
  useRealtimeEvent('order.ready', onOrder);
  useRealtimeEvent('order.served', onOrder);
  useRealtimeEvent('order.completed', onOrder);
  useRealtimeEvent('order.cancelled', onOrder);
  useRealtimeEvent('order.updated', onOrder);

  useRealtimeEvent('delivery.order', () => invalidateMany(['orders', 'kds', 'reports', 'dashboard']));

  const onTable = () => invalidateMany(['floor', 'tables', 'dashboard']);
  useRealtimeEvent('table.updated', onTable);
  useRealtimeEvent('table.cleaned', onTable);
  useRealtimeEvent('table.available', onTable);

  const onBill = () => invalidateMany(['bills', 'reports', 'dashboard', 'payments']);
  useRealtimeEvent('bill.created', onBill);
  useRealtimeEvent('bill.updated', onBill);
  useRealtimeEvent('bill.paid', onBill);
  useRealtimeEvent('bill.requested', () => invalidate('floor'));

  const onPayment = (payload: { amount?: number; method?: string }) => {
    invalidateMany(['payments', 'bills', 'reports', 'dashboard']);
    if ((role === 'OWNER' || role === 'MANAGER' || role === 'CASHIER') && payload?.amount) {
      push({ kind: 'event', title: `${payload.method ?? 'Payment'} received`, body: inr(payload.amount) });
    }
  };
  useRealtimeEvent('payment.succeeded', onPayment);
  useRealtimeEvent('payment.refunded', () => invalidateMany(['payments', 'bills', 'reports']));
  useRealtimeEvent('payment.failed', () => invalidate('payments'));

  const onBooking = () => invalidateMany(['bookings', 'dashboard']);
  useRealtimeEvent('booking.created', onBooking);
  useRealtimeEvent('booking.updated', onBooking);
  useRealtimeEvent('booking.reminder', onBooking);

  const onRequest = (r?: { tableNumber?: string; type?: string }) => {
    invalidateMany(['requests', 'floor']);
    if (role === 'WAITER' && r?.type) {
      push({ kind: 'event', title: `Table ${r.tableNumber ?? ''}`, body: r.type.replace(/_/g, ' ').toLowerCase() });
    }
  };
  useRealtimeEvent('customer.requested', onRequest);
  useRealtimeEvent('request.updated', () => invalidateMany(['requests', 'floor']));

  useRealtimeEvent('menu.updated', () => invalidate('menu'));
  useRealtimeEvent('staff.updated', () => invalidate('staff'));
  const onInventory = () => invalidateMany(['inventory', 'dashboard']);
  useRealtimeEvent('inventory.updated', onInventory);
  useRealtimeEvent('inventory.low_stock', (payload: { name?: string }) => {
    onInventory();
    if (role === 'OWNER' || role === 'MANAGER') {
      push({ kind: 'error', title: 'Low stock', body: payload?.name ? `${payload.name} is running out` : 'An item is running out' });
    }
  });

  useEffect(() => {
    // Re-arm notifications when the acting user changes (login / role switch).
    void userId;
  }, [userId]);
}

/** Call after a local mutation to refresh the affected slices immediately. */
export function refresh(...prefixes: string[]) {
  for (const p of prefixes) invalidate(p);
}
