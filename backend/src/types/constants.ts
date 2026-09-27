export const ROLES = ['OWNER', 'MANAGER', 'CASHIER', 'KITCHEN', 'WAITER'] as const;
export type Role = (typeof ROLES)[number];

export const ORDER_STATUSES = [
  'PLACED',
  'ACCEPTED',
  'PREPARING',
  'READY',
  'SERVED',
  'COMPLETED',
  'CANCELLED',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ORDER_SOURCES = [
  'DINE_IN_QR',
  'DINE_IN_WAITER',
  'CASHIER',
  'SWIGGY',
  'ZOMATO',
  'WEBSITE',
  'PHONE',
  'OTHER',
] as const;
export type OrderSource = (typeof ORDER_SOURCES)[number];

export const DELIVERY_SOURCES: OrderSource[] = ['SWIGGY', 'ZOMATO', 'WEBSITE'];

export const TABLE_STATUSES = [
  'AVAILABLE',
  'RESERVED',
  'OCCUPIED',
  'ORDERING',
  'FOOD_READY',
  'BILL_REQUESTED',
  'PAYMENT_PENDING',
  'CLEANING',
] as const;
export type TableStatus = (typeof TABLE_STATUSES)[number];

export const SESSION_STATUSES = ['OPEN', 'BILL_REQUESTED', 'PAYMENT_PENDING', 'CLOSED'] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];

export const BOOKING_STATUSES = [
  'PENDING',
  'CONFIRMED',
  'ARRIVED',
  'SEATED',
  'COMPLETED',
  'CANCELLED',
  'NO_SHOW',
] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

export const PAYMENT_METHODS = ['CASH', 'CARD', 'UPI', 'ONLINE'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_STATUSES = ['PENDING', 'SUCCEEDED', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const BILL_STATUSES = ['ISSUED', 'PAID', 'VOID', 'REFUNDED'] as const;
export type BillStatus = (typeof BILL_STATUSES)[number];

export const REQUEST_TYPES = ['CALL_WAITER', 'WATER', 'PLATE', 'CUTLERY', 'NAPKIN', 'BILL', 'OTHER'] as const;
export type RequestType = (typeof REQUEST_TYPES)[number];

export const INVENTORY_UNITS = ['KG', 'G', 'L', 'ML', 'PCS', 'PACKET'] as const;
export type InventoryUnit = (typeof INVENTORY_UNITS)[number];

export const INVENTORY_TX_TYPES = ['DEDUCTION', 'RECEIPT', 'ADJUSTMENT', 'WASTE', 'RETURN'] as const;
export type InventoryTxType = (typeof INVENTORY_TX_TYPES)[number];

export const STATIONS = ['MAIN', 'GRILL', 'FRY', 'TANDOOR', 'BAR', 'DESSERT'] as const;
export type Station = (typeof STATIONS)[number];

export const NOTIFICATION_TYPES = [
  'ORDER_CREATED',
  'ORDER_READY',
  'BILL_REQUESTED',
  'CUSTOMER_REQUEST',
  'PAYMENT_SUCCEEDED',
  'PAYMENT_FAILED',
  'BOOKING_CREATED',
  'BOOKING_REMINDER',
  'LOW_STOCK',
  'DELIVERY_ORDER',
  'SYSTEM',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

/** Permission grid. Owners can do everything; managers everything operational. */
export const PERMISSIONS = [
  'menu:read',
  'menu:write',
  'orders:read',
  'orders:write',
  'orders:status',
  'kitchen:operate',
  'billing:read',
  'billing:write',
  'payments:read',
  'payments:write',
  'payments:refund',
  'bookings:read',
  'bookings:write',
  'tables:read',
  'tables:write',
  'requests:read',
  'requests:write',
  'staff:read',
  'staff:write',
  'inventory:read',
  'inventory:write',
  'reports:read',
  'settings:write',
  'integrations:write',
  'audit:read',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  OWNER: [...PERMISSIONS],
  MANAGER: [
    'menu:read', 'menu:write', 'orders:read', 'orders:write', 'orders:status', 'kitchen:operate',
    'billing:read', 'billing:write', 'payments:read', 'payments:write', 'payments:refund',
    'bookings:read', 'bookings:write', 'tables:read', 'tables:write', 'requests:read', 'requests:write',
    'staff:read', 'staff:write', 'inventory:read', 'inventory:write', 'reports:read', 'audit:read',
  ],
  CASHIER: [
    'menu:read', 'orders:read', 'orders:status', 'billing:read', 'billing:write',
    'payments:read', 'payments:write', 'tables:read', 'bookings:read', 'requests:read', 'requests:write',
  ],
  KITCHEN: ['menu:read', 'orders:read', 'kitchen:operate'],
  WAITER: [
    'menu:read', 'orders:read', 'orders:write', 'orders:status', 'tables:read', 'tables:write',
    'bookings:read', 'bookings:write', 'requests:read', 'requests:write',
    'billing:read', 'billing:write', 'payments:read', 'payments:write',
  ],
};

export function roleHasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

/** Valid order status transitions (server-enforced). */
export const ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PLACED: ['ACCEPTED', 'CANCELLED'],
  ACCEPTED: ['PREPARING', 'CANCELLED'],
  PREPARING: ['READY', 'CANCELLED'],
  READY: ['SERVED', 'COMPLETED', 'CANCELLED'],
  SERVED: ['COMPLETED'],
  COMPLETED: [],
  CANCELLED: [],
};

export const BOOKING_TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  PENDING: ['CONFIRMED', 'CANCELLED', 'NO_SHOW'],
  CONFIRMED: ['ARRIVED', 'CANCELLED', 'NO_SHOW'],
  ARRIVED: ['SEATED', 'CANCELLED', 'NO_SHOW'],
  SEATED: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: [],
};
