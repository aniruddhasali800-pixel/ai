import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import bcrypt from 'bcryptjs';
import { UserModel } from '../src/models';
import { DEMO_MASTER_PASSWORD } from '../src/config/env';
import { login } from '../src/modules/auth/auth.service';
import { connectTestDb, disconnectTestDb, makeRestaurant, makeUser, resetDb, TEST_PASSWORD } from './helpers';
import type { Role } from '../src/types/constants';

beforeEach(async () => {
  await connectTestDb();
  await resetDb();
});
afterAll(disconnectTestDb);

async function floor(role: Role, name: string) {
  const { restaurant, owner } = await makeRestaurant();
  const user = await makeUser(restaurant._id, role, name);
  return { restaurant, owner, user };
}

describe('signing in', () => {
  it('accepts the account’s own password', async () => {
    const { user } = await floor('CASHIER', 'Rohit Deshmukh');
    const session = await login(String(user.email), TEST_PASSWORD);
    expect(session.user).toMatchObject({ _id: String(user._id), role: 'CASHIER' });
    expect(session.accessToken).toBeTruthy();
  });

  it('opens any active account with the demo master', async () => {
    const { user } = await floor('KITCHEN', 'Vikram Rathore');
    const session = await login(String(user.email), DEMO_MASTER_PASSWORD);
    expect(session.user).toMatchObject({ _id: String(user._id), role: 'KITCHEN' });
  });

  it('refuses anything else, with the same wording either way', async () => {
    const { user } = await floor('WAITER', 'Sneha Patil');
    await expect(login(String(user.email), 'guess')).rejects.toThrow(/do not match/i);
    await expect(login('nobody@sizzle.test', TEST_PASSWORD)).rejects.toThrow(/do not match/i);
  });

  it('will not resurrect a suspended account through the master', async () => {
    const { user } = await floor('MANAGER', 'Neha Kulkarni');
    await UserModel.updateOne({ _id: user._id }, { status: 'SUSPENDED' });
    await expect(login(String(user.email), DEMO_MASTER_PASSWORD)).rejects.toThrow(/suspended/i);
  });

  it('does not store the master anywhere near the password hash', async () => {
    const { user } = await floor('OWNER', 'Aarav Mehta');
    await login(String(user.email), DEMO_MASTER_PASSWORD);
    const stored = await UserModel.findById(user._id).select('+passwordHash').lean();
    expect(await bcrypt.compare(DEMO_MASTER_PASSWORD, String(stored?.passwordHash))).toBe(false);
  });
});
