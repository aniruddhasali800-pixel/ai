export type Role = 'OWNER' | 'MANAGER' | 'CASHIER' | 'KITCHEN' | 'WAITER';
export type OrderStatus = 'PLACED' | 'ACCEPTED' | 'PREPARING' | 'READY' | 'SERVED' | 'COMPLETED' | 'CANCELLED';
export type OrderSource =
  | 'DINE_IN_QR'
  | 'DINE_IN_WAITER'
  | 'CASHIER'
  | 'SWIGGY'
  | 'ZOMATO'
  | 'WEBSITE'
  | 'PHONE'
  | 'OTHER';
export type TableStatus =
  | 'AVAILABLE'
  | 'RESERVED'
  | 'OCCUPIED'
  | 'ORDERING'
  | 'FOOD_READY'
  | 'BILL_REQUESTED'
  | 'PAYMENT_PENDING'
  | 'CLEANING';
export type SessionStatus = 'OPEN' | 'BILL_REQUESTED' | 'PAYMENT_PENDING' | 'CLOSED';
export type BookingStatus = 'PENDING' | 'CONFIRMED' | 'ARRIVED' | 'SEATED' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW';
export type PaymentMethod = 'CASH' | 'CARD' | 'UPI' | 'ONLINE';
export type PaymentStatus = 'PENDING' | 'SUCCEEDED' | 'FAILED' | 'REFUNDED' | 'PARTIALLY_REFUNDED';
export type BillStatus = 'ISSUED' | 'PAID' | 'VOID' | 'REFUNDED';
export type RequestType = 'CALL_WAITER' | 'WATER' | 'PLATE' | 'CUTLERY' | 'NAPKIN' | 'BILL' | 'CASH_PAYMENT' | 'OTHER';
export type Station = 'MAIN' | 'GRILL' | 'FRY' | 'TANDOOR' | 'BAR' | 'DESSERT';
export type InventoryUnit = 'KG' | 'G' | 'L' | 'ML' | 'PCS' | 'PACKET';
export type InventoryTxType = 'DEDUCTION' | 'RECEIPT' | 'ADJUSTMENT' | 'WASTE' | 'RETURN';
export type NotificationType =
  | 'ORDER_CREATED'
  | 'ORDER_READY'
  | 'BILL_REQUESTED'
  | 'CUSTOMER_REQUEST'
  | 'PAYMENT_SUCCEEDED'
  | 'PAYMENT_FAILED'
  | 'BOOKING_CREATED'
  | 'BOOKING_REMINDER'
  | 'LOW_STOCK'
  | 'DELIVERY_ORDER'
  | 'SYSTEM';

export interface Address {
  line1?: string;
  city?: string;
  state?: string;
  pincode?: string;
}

export interface RestaurantSettings {
  acceptingOrders: boolean;
  autoAcceptOrders: boolean;
  billFooterNote: string;
  bookingEnabled: boolean;
  bookingSlotMinutes: number;
  bookingDurationMinutes: number;
  bookingReminderMinutes: number;
  allowWaiterCash: boolean;
}

export interface Restaurant {
  _id: string;
  ownerId?: string;
  name: string;
  slug: string;
  phone?: string;
  email?: string;
  address?: Address;
  payment?: { upiId?: string; upiName?: string };
  currency: string;
  taxPercent: number;
  serviceChargePercent: number;
  hours: { open: string; close: string };
  branding: { logoUrl?: string; coverUrl?: string; tagline?: string };
  settings?: RestaurantSettings;
  createdAt?: string;
}

export interface User {
  _id: string;
  restaurantId: string;
  role: Role;
  name: string;
  email: string | null;
  phone: string | null;
  status: 'ACTIVE' | 'SUSPENDED';
  lastLoginAt: string | null;
  createdAt: string;
}

export interface AuthResult {
  user: User;
  restaurant?: Restaurant;
  accessToken: string;
  refreshToken: string;
  expiresInDays?: number;
}

export interface Paginated<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

export interface OrderAddon {
  addonId: string;
  name: string;
  price: number;
}

export interface OrderItem {
  productId: string;
  name: string;
  price: number;
  qty: number;
  taxPercent: number;
  station: Station;
  isVeg?: boolean;
  addons: OrderAddon[];
  notes: string;
  lineTotal: number;
}

export interface OrderEvent {
  status: OrderStatus;
  at: string;
  byUserId: string | null;
}

export interface Order {
  _id: string;
  restaurantId: string;
  orderNumber: string;
  source: OrderSource;
  tableId: string | null;
  /** Carried on kitchen tickets so the pass calls the right table, not just an order code. */
  tableNumber?: string;
  tableSessionId: string | null;
  waiterId: string | null;
  cashierId: string | null;
  customerName: string;
  customerPhone: string;
  customerAddress?: string;
  customerCity?: string;
  externalOrderId: string | null;
  items: OrderItem[];
  subtotal: number;
  taxTotal: number;
  serviceCharge: number;
  discountAmount: number;
  discountNote?: string;
  roundOff: number;
  grandTotal: number;
  status: OrderStatus;
  cancelReason?: string;
  paymentStatus: 'UNPAID' | 'PAID' | 'REFUNDED';
  billId: string | null;
  notes: string;
  placedAt: string;
  acceptedAt: string | null;
  readyAt: string | null;
  servedAt: string | null;
  completedAt: string | null;
  statusHistory: OrderEvent[];
  createdAt: string;
}

export interface Category {
  _id: string;
  restaurantId: string;
  name: string;
  description: string;
  sortOrder: number;
  isActive: boolean;
}

export interface Addon {
  _id: string;
  restaurantId: string;
  name: string;
  price: number;
  isActive: boolean;
}

export interface RecipeLine {
  inventoryItemId: string;
  qty: number;
}

export interface Product {
  _id: string;
  restaurantId: string;
  categoryId: string;
  name: string;
  description: string;
  price: number;
  imageUrl: string;
  taxPercent: number | null;
  isVeg: boolean;
  isActive: boolean;
  station: Station;
  sortOrder: number;
  prepMinutes: number;
  addonIds: string[];
  recipe: RecipeLine[];
  tags: string[];
}

export interface MenuBundle {
  categories: Category[];
  products: Product[];
  addons: Addon[];
}

export interface TableSessionRef {
  _id: string;
  publicToken: string;
  status: SessionStatus;
  guestCount: number;
  customerName: string;
  openedAt: string;
}

export interface Table {
  _id: string;
  restaurantId: string;
  number: string;
  capacity: number;
  section: string;
  description: string;
  status: TableStatus;
  qrToken: string;
  activeSessionId: string | null;
  assignedWaiterId: string | null;
  lastCleanedAt?: string;
  qrUrl?: string;
  session?: TableSessionRef | null;
}

export interface WaiterTable extends Table {
  assignedWaiterName: string | null;
  mine: boolean;
  session: TableSessionRef | null;
  activeOrders: { _id: string; orderNumber: string; status: OrderStatus; grandTotal: number; itemCount: number }[];
  openRequests: { _id: string; type: RequestType; note: string; status: string; createdAt: string }[];
  runningTotal: number;
}

export interface CustomerRequest {
  _id: string;
  restaurantId: string;
  tableId: string;
  tableSessionId: string;
  type: RequestType;
  note: string;
  status: 'OPEN' | 'ACKNOWLEDGED' | 'DONE';
  handledByUserId: string | null;
  handledAt: string | null;
  billId: string | null;
  tendered: number | null;
  collectedByUserId: string | null;
  collectedAt: string | null;
  createdAt: string;
  tableNumber?: string;
  mine?: boolean;
  billNumber?: string | null;
  billGrandTotal?: number | null;
}

export interface TaxLine {
  label: string;
  percent: number;
  amount: number;
}

export interface Bill {
  _id: string;
  restaurantId: string;
  billNumber: string;
  orderIds: string[];
  tableSessionId: string | null;
  tableId: string | null;
  tableNumber: string;
  customerName: string;
  subtotal: number;
  taxTotal: number;
  serviceCharge: number;
  discountAmount: number;
  roundOff: number;
  grandTotal: number;
  taxBreakup: TaxLine[];
  status: BillStatus;
  paymentStatus: 'UNPAID' | 'PAID' | 'REFUNDED';
  publicToken: string;
  issuedByUserId: string;
  issuedAt: string;
  paidAt: string | null;
  printCount: number;
  lastPrintedAt: string | null;
  notes: string;
  createdAt: string;
}

export interface Payment {
  _id: string;
  restaurantId: string;
  billId: string;
  orderIds: string[];
  method: PaymentMethod;
  provider: string;
  amount: number;
  tendered: number | null;
  change: number | null;
  transactionId: string | null;
  providerOrderId: string | null;
  checkoutUrl: string | null;
  status: PaymentStatus;
  failureReason: string;
  collectedByUserId: string | null;
  collectedByName?: string | null;
  verifiedAt: string | null;
  refunds: { amount: number; reason: string; at: string }[];
  createdAt: string;
}

export interface Booking {
  _id: string;
  restaurantId: string;
  tableId: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  notes: string;
  startAt: string;
  durationMinutes: number;
  guests: number;
  status: BookingStatus;
  source: 'CUSTOMER' | 'STAFF';
  assignedWaiterId: string | null;
  tableNumber?: string;
  tableSection?: string;
  assignedWaiterName?: string | null;
  createdAt: string;
}

export interface InventoryItem {
  _id: string;
  restaurantId: string;
  name: string;
  unit: InventoryUnit;
  stock: number;
  lowStockThreshold: number;
  costPerUnit: number;
  supplier: string;
  isActive: boolean;
  isLow?: boolean;
}

export interface InventoryTx {
  _id: string;
  itemId: string;
  itemName: string;
  unit: string;
  type: InventoryTxType;
  qty: number;
  balanceAfter: number;
  note: string;
  byUserId: string | null;
  orderId: string | null;
  createdAt: string;
}

export interface AppNotification {
  _id: string;
  recipientId: string;
  type: NotificationType;
  title: string;
  body: string;
  entityType: string | null;
  entityId: string | null;
  data: unknown;
  readAt: string | null;
  createdAt: string;
}

export interface AuditEntry {
  _id: string;
  actorId: string | null;
  actorName: string;
  action: string;
  entityType: string;
  entityId: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface DashboardData {
  today: { revenue: number; orders: number; avgOrderValue: number; trendPct: number };
  yesterday: { revenue: number; orders: number };
  live: { activeOrders: number; unpaidBills: number; unpaidAmount: number; openSessions: number };
  tables: { status: TableStatus; count: number }[];
  lowStock: { count: number; items: { _id: string; name: string; stock: number; unit: string }[] };
  upcomingBookings: number;
  week: { label: string; revenue: number; orders: number }[];
  hourly: { hour: number; orders: number; revenue: number }[];
  topItems: { name: string; qty: number; revenue: number }[];
  recentOrders: {
    _id: string;
    orderNumber: string;
    source: OrderSource;
    status: OrderStatus;
    paymentStatus: string;
    grandTotal: number;
    customerName: string;
    createdAt: string;
  }[];
}

export interface SalesReport {
  range: { from: string; to: string; granularity: 'day' | 'week' | 'month' | 'year' };
  totals: { revenue: number; orders: number; avgOrderValue: number; tax: number; discount: number; serviceCharge: number };
  series: { label: string; revenue: number; orders: number }[];
  channels: { channel: 'DINE_IN' | 'DELIVERY' | 'TAKEAWAY'; revenue: number; orders: number }[];
  sources: { source: OrderSource; revenue: number; orders: number }[];
  hourly: { hour: number; orders: number; revenue: number }[];
}

export interface ProductReport {
  range: { from: string; to: string };
  topProducts: { name: string; qty: number; revenue: number }[];
  slowMovers: { name: string; qty: number; revenue: number }[];
  categories: { category: string; qty: number; revenue: number }[];
}

export interface PaymentReport {
  range: { from: string; to: string };
  totals: { collected: number; refunded: number; net: number; count: number };
  byMethod: { method: PaymentMethod; amount: number; count: number }[];
  byProvider: { provider: string; amount: number; count: number }[];
  cashierPerformance: { userId: string; name: string; collected: number; count: number }[];
}

export interface OperationsReport {
  range: { from: string; to: string };
  waiters: { userId: string; name: string; orders: number; revenue: number }[];
  occupancy: { date: string; sessions: number; guests: number; avgMinutes: number }[];
  tableStatus: { status: TableStatus; count: number }[];
  bookings: { status: BookingStatus; count: number }[];
  taxBreakup: { label: string; percent: number; amount: number }[];
}

export interface DeliveryAdapter {
  provider: 'SWIGGY' | 'ZOMATO' | 'WEBSITE';
  label: string;
  configured: boolean;
  webhookUrl: string;
  signatureHeader: string;
  docsHint: string;
}

export interface GuestMenu {
  restaurant: {
    _id: string;
    name: string;
    slug: string;
    phone: string;
    address: Address;
    currency: string;
    hours: { open: string; close: string };
    branding: { logoUrl?: string; coverUrl?: string; tagline?: string };
    acceptingOrders: boolean;
    bookingEnabled: boolean;
    taxPercent: number;
    serviceChargePercent: number;
  };
  table: { _id: string; number: string; section: string; status: TableStatus };
  categories: { _id: string; name: string; description: string }[];
  products: {
    _id: string;
    categoryId: string;
    name: string;
    description: string;
    price: number;
    imageUrl: string;
    isVeg: boolean;
    taxPercent: number | null;
    prepMinutes: number;
    tags: string[];
    addonIds: string[];
  }[];
  addons: { _id: string; name: string; price: number }[];
  session: { publicToken: string; status: SessionStatus; guestCount: number; customerName: string } | null;
}

export interface GuestSession {
  session: { _id: string; publicToken: string; status: SessionStatus; guestCount: number; customerName: string; openedAt: string };
  table: { _id: string; number: string; section: string } | null;
  orders: {
    _id: string;
    orderNumber: string;
    status: OrderStatus;
    items: OrderItem[];
    subtotal: number;
    taxTotal: number;
    serviceCharge: number;
    grandTotal: number;
    notes: string;
    placedAt: string;
  }[];
  requests: {
    _id: string;
    type: RequestType;
    note: string;
    status: string;
    tendered: number | null;
    collectedAt: string | null;
    createdAt: string;
  }[];
  bill: { _id: string; billNumber: string; grandTotal: number; publicToken: string } | null;
  runningTotal: number;
}

export interface PublicBill {
  billNumber: string;
  tableNumber: string;
  customerName: string;
  status: BillStatus;
  paymentStatus: 'UNPAID' | 'PAID' | 'REFUNDED';
  subtotal: number;
  discountAmount: number;
  serviceCharge: number;
  taxTotal: number;
  roundOff: number;
  grandTotal: number;
  taxBreakup: TaxLine[];
  issuedAt: string;
  paidAt: string | null;
  /** The restaurant's own mark, printed beside the Sizzle one. */
  merchant: { name: string; logoUrl: string } | null;
  /** Lets the guest phone join its table's realtime room and watch the bill settle. */
  sessionToken: string | null;
  items: {
    name: string;
    qty: number;
    price: number;
    isVeg: boolean;
    addons: { name: string; price: number }[];
    lineTotal: number;
  }[];
  pay: UpiCharge | null;
}

/** A scannable UPI intent built server-side from the exact bill total. */
export interface UpiCharge {
  link: string;
  qrDataUrl: string;
  upiId: string;
  payeeName: string;
  amount: number;
  note: string;
}
