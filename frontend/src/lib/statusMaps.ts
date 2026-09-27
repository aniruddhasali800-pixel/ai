import type { ReactNode } from 'react';
import type {
  BillStatus,
  BookingStatus,
  OrderSource,
  OrderStatus,
  PaymentStatus,
  TableStatus,
} from '../lib/types';

export const ORDER_STATUS_META: Record<OrderStatus, { label: string; cls: string; dot: string }> = {
  PLACED: { label: 'New', cls: 'bg-ember-50 text-ember-700 ring-ember-200', dot: 'bg-ember-500' },
  ACCEPTED: { label: 'Accepted', cls: 'bg-amber-50 text-amber-800 ring-amber-200', dot: 'bg-amber-500' },
  PREPARING: { label: 'Firing', cls: 'bg-blue-50 text-blue-800 ring-blue-200', dot: 'bg-blue-500' },
  READY: { label: 'Ready', cls: 'bg-leaf-100 text-leaf-600 ring-leaf-500/30', dot: 'bg-leaf-500' },
  SERVED: { label: 'Served', cls: 'bg-stone-100 text-stone-700 ring-stone-300', dot: 'bg-stone-500' },
  COMPLETED: { label: 'Closed', cls: 'bg-ink-100 text-ink-600 ring-ink-300', dot: 'bg-ink-400' },
  CANCELLED: { label: 'Cancelled', cls: 'bg-red-50 text-red-700 ring-red-200', dot: 'bg-red-500' },
};

export const TABLE_STATUS_META: Record<TableStatus, { label: string; card: string; chip: string; text: string }> = {
  AVAILABLE: { label: 'Available', card: 'bg-white border-ink-200', chip: 'bg-ink-100', text: 'text-ink-600' },
  RESERVED: { label: 'Reserved', card: 'bg-violet-50 border-violet-200', chip: 'bg-violet-100', text: 'text-violet-700' },
  OCCUPIED: { label: 'Seated', card: 'bg-ink-900 border-ink-900', chip: 'bg-white/15', text: 'text-white' },
  ORDERING: { label: 'Ordering', card: 'bg-ember-500 border-ember-600', chip: 'bg-white/20', text: 'text-white' },
  FOOD_READY: { label: 'Food ready', card: 'bg-leaf-500 border-leaf-600', chip: 'bg-white/20', text: 'text-white' },
  BILL_REQUESTED: { label: 'Bill asked', card: 'bg-amber-400 border-amber-500', chip: 'bg-black/10', text: 'text-ink-900' },
  PAYMENT_PENDING: { label: 'To pay', card: 'bg-amber-600 border-amber-700', chip: 'bg-white/20', text: 'text-white' },
  CLEANING: { label: 'Cleaning', card: 'bg-stone-200 border-stone-300', chip: 'bg-stone-300', text: 'text-stone-700' },
};

export const SOURCE_META: Record<OrderSource, { label: string; short: string }> = {
  DINE_IN_QR: { label: 'QR order', short: 'QR' },
  DINE_IN_WAITER: { label: 'Waiter', short: 'WT' },
  CASHIER: { label: 'Takeaway', short: 'TK' },
  SWIGGY: { label: 'Swiggy', short: 'SW' },
  ZOMATO: { label: 'Zomato', short: 'ZM' },
  WEBSITE: { label: 'Website', short: 'WB' },
  PHONE: { label: 'Phone', short: 'PH' },
  OTHER: { label: 'Other', short: '—' },
};

export const BOOKING_STATUS_META: Record<BookingStatus, { label: string; cls: string }> = {
  PENDING: { label: 'Pending', cls: 'bg-amber-50 text-amber-800 ring-amber-200' },
  CONFIRMED: { label: 'Confirmed', cls: 'bg-leaf-100 text-leaf-600 ring-leaf-500/30' },
  ARRIVED: { label: 'Arrived', cls: 'bg-blue-50 text-blue-800 ring-blue-200' },
  SEATED: { label: 'Seated', cls: 'bg-ember-50 text-ember-700 ring-ember-200' },
  COMPLETED: { label: 'Completed', cls: 'bg-ink-100 text-ink-600 ring-ink-300' },
  CANCELLED: { label: 'Cancelled', cls: 'bg-red-50 text-red-700 ring-red-200' },
  NO_SHOW: { label: 'No show', cls: 'bg-stone-100 text-stone-600 ring-stone-300' },
};

export const BILL_STATUS_META: Record<BillStatus, { label: string; cls: string }> = {
  ISSUED: { label: 'Unpaid', cls: 'bg-amber-50 text-amber-800 ring-amber-200' },
  PAID: { label: 'Paid', cls: 'bg-leaf-100 text-leaf-600 ring-leaf-500/30' },
  VOID: { label: 'Void', cls: 'bg-stone-100 text-stone-600 ring-stone-300' },
  REFUNDED: { label: 'Refunded', cls: 'bg-red-50 text-red-700 ring-red-200' },
};

export const PAYMENT_STATUS_META: Record<PaymentStatus, { label: string; cls: string }> = {
  PENDING: { label: 'Pending', cls: 'bg-amber-50 text-amber-800 ring-amber-200' },
  SUCCEEDED: { label: 'Succeeded', cls: 'bg-leaf-100 text-leaf-600 ring-leaf-500/30' },
  FAILED: { label: 'Failed', cls: 'bg-red-50 text-red-700 ring-red-200' },
  REFUNDED: { label: 'Refunded', cls: 'bg-stone-100 text-stone-600 ring-stone-300' },
  'PARTIALLY_REFUNDED': { label: 'Part refund', cls: 'bg-orange-50 text-orange-700 ring-orange-200' },
};

/** Valid next steps for the staff UI, mirroring the server's state machine. */
export const NEXT_ORDER_STATUS: Record<OrderStatus, OrderStatus[]> = {
  PLACED: ['ACCEPTED', 'CANCELLED'],
  ACCEPTED: ['PREPARING', 'CANCELLED'],
  PREPARING: ['READY', 'CANCELLED'],
  READY: ['SERVED', 'COMPLETED', 'CANCELLED'],
  SERVED: ['COMPLETED'],
  COMPLETED: [],
  CANCELLED: [],
};

export const KITCHEN_ACTIONS: Partial<Record<OrderStatus, { next: OrderStatus; label: string; tone: 'primary' | 'success' | 'danger' }[]>> = {
  PLACED: [{ next: 'ACCEPTED', label: 'Start cooking', tone: 'primary' }],
  ACCEPTED: [{ next: 'PREPARING', label: 'Firing now', tone: 'primary' }],
  PREPARING: [{ next: 'READY', label: 'Mark ready', tone: 'success' }],
  READY: [{ next: 'SERVED', label: 'Handed over', tone: 'success' }],
};

export const REQUEST_LABEL: Record<string, { label: string; emoji: string }> = {
  CALL_WAITER: { label: 'Call waiter', emoji: '🔔' },
  WATER: { label: 'Water refill', emoji: '💧' },
  PLATE: { label: 'Extra plate', emoji: '🍽️' },
  CUTLERY: { label: 'Cutlery', emoji: '🍴' },
  NAPKIN: { label: 'Napkins', emoji: '🧻' },
  BILL: { label: 'Bill please', emoji: '🧾' },
  OTHER: { label: 'Assistance', emoji: '✋' },
};

export function statusLabel(kind: 'order' | 'table' | 'booking', status: string): string {
  if (kind === 'order') return ORDER_STATUS_META[status as OrderStatus]?.label ?? status;
  if (kind === 'table') return TABLE_STATUS_META[status as TableStatus]?.label ?? status;
  return BOOKING_STATUS_META[status as BookingStatus]?.label ?? status;
}

export function stationLabel(station: string): string {
  const map: Record<string, string> = {
    MAIN: 'Main kitchen',
    GRILL: 'Grill',
    FRY: 'Fry',
    TANDOOR: 'Tandoor',
    BAR: 'Bar',
    DESSERT: 'Dessert',
  };
  return map[station] ?? station;
}

export type Tone = 'default' | 'muted';

export interface Chip {
  label: string;
  cls: string;
  icon?: ReactNode;
}
