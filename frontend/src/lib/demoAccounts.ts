/**
 * The seeded demo tenant's staff logins, in one place so the sign-in screen and the hub cannot
 * each remember a different password for the same person. These are throwaway credentials for a
 * restaurant with no real guests and no real money behind it — the same list is committed at the
 * repository root in DEMO-CREDENTIALS.md.
 *
 * The master opens any active staff account so a walk-through of every screen needs one line to
 * remember rather than seven. It is the API's DEMO_MASTER_PASSWORD, and a production deployment
 * answers it with nothing.
 */
export const DEMO_MASTER = 'Sizzle@Master1';

/** Email → the password that account was seeded with. */
export const DEMO_PASSWORDS: Record<string, string> = {
  'owner@sizzle.test': 'Owner@Sizzle1',
  'manager@sizzle.test': 'Manager@Sizzle1',
  'cashier@sizzle.test': 'Cashier@Sizzle1',
  'kitchen@sizzle.test': 'Kitchen@Sizzle1',
  'waiter1@sizzle.test': 'Waiter1@Sizzle1',
  'waiter2@sizzle.test': 'Waiter2@Sizzle1',
  'waiter3@sizzle.test': 'Waiter3@Sizzle1',
};

export function demoPassword(email: string): string {
  return DEMO_PASSWORDS[email] ?? DEMO_MASTER;
}
