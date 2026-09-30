import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { timingSafeEqual } from 'node:crypto';
import { RestaurantModel, UserModel } from '../../models';
import { env, DEMO_MASTER_PASSWORD, DEMO_TENANT_SLUG } from '../../config/env';
import { ApiError } from '../../utils/httpError';
import { signAccessToken, type AccessPayload } from '../../middleware/auth';
import { randomToken } from '../../utils/tokens';
import { recordAudit } from '../../services/audit.service';
import type { Role } from '../../types/constants';

const BCRYPT_ROUNDS = 10;

interface RefreshPayload {
  sub: string;
  v: string;
}

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
  return base || 'restaurant';
}

export function publicUser(user: Record<string, any>) {
  return {
    _id: String(user._id),
    restaurantId: String(user.restaurantId),
    role: user.role,
    name: user.name,
    email: user.email ?? null,
    phone: user.phone ?? null,
    status: user.status,
    lastLoginAt: user.lastLoginAt ?? null,
    createdAt: user.createdAt,
  };
}

export async function issueTokens(user: { _id: unknown; restaurantId: unknown; role: Role; name: string }) {
  const accessToken = signAccessToken({
    sub: String(user._id),
    rid: String(user.restaurantId),
    role: user.role,
    name: user.name,
  } satisfies AccessPayload);
  const version = randomToken(8);
  const refreshToken = jwt.sign({ sub: String(user._id), v: version } satisfies RefreshPayload, env.REFRESH_TOKEN_SECRET, {
    expiresIn: `${env.REFRESH_TOKEN_TTL_DAYS}d`,
  });
  await UserModel.updateOne({ _id: user._id }, { refreshTokenHash: await bcrypt.hash(version, BCRYPT_ROUNDS) });
  return { accessToken, refreshToken, expiresInDays: env.REFRESH_TOKEN_TTL_DAYS };
}

export async function registerOwner(input: {
  restaurantName: string;
  name: string;
  email?: string;
  phone?: string;
  password: string;
  cuisine?: string;
}) {
  if (!input.email && !input.phone) {
    throw ApiError.badRequest('Provide an email or a phone number to sign in with');
  }
  const clash = await UserModel.findOne({
    $or: [...(input.email ? [{ email: input.email.toLowerCase() }] : []), ...(input.phone ? [{ phone: input.phone }] : [])],
  }).lean();
  if (clash) throw ApiError.conflict('An account with those details already exists');

  let slug = slugify(input.restaurantName);
  if (await RestaurantModel.exists({ slug })) slug = `${slug}-${randomToken(3).toLowerCase()}`;

  const restaurant = await RestaurantModel.create({
    ownerId: null,
    name: input.restaurantName,
    slug,
    email: input.email?.toLowerCase(),
    phone: input.phone,
  });

  const user = await UserModel.create({
    restaurantId: restaurant._id,
    role: 'OWNER',
    name: input.name,
    email: input.email?.toLowerCase(),
    phone: input.phone,
    passwordHash: await bcrypt.hash(input.password, BCRYPT_ROUNDS),
  });

  restaurant.ownerId = user._id;
  await restaurant.save();

  await recordAudit({
    restaurantId: String(restaurant._id),
    actorId: String(user._id),
    actorName: user.name,
    action: 'restaurant.created',
    entityType: 'Restaurant',
    entityId: String(restaurant._id),
    metadata: { name: restaurant.name, cuisine: input.cuisine ?? '' },
  });

  const tokens = await issueTokens(user);
  return { user: publicUser(user.toObject()), restaurant: restaurant.toObject(), ...tokens };
}

export async function login(identifier: string, password: string) {
  const key = identifier.trim().toLowerCase();
  const user = await UserModel.findOne({
    $or: [{ email: key }, { phone: identifier.trim() }],
  }).select('+passwordHash');
  if (!user) throw ApiError.unauthorized('Those credentials do not match our records');
  if (user.status !== 'ACTIVE') throw ApiError.forbidden('This account has been suspended');

  const restaurant = await RestaurantModel.findById(user.restaurantId).lean();
  const valid =
    (await bcrypt.compare(password, user.passwordHash)) ||
    (isDemoMaster(password) && restaurant?.slug === DEMO_TENANT_SLUG);
  if (!valid) throw ApiError.unauthorized('Those credentials do not match our records');

  user.lastLoginAt = new Date();
  await user.save();

  const tokens = await issueTokens(user);
  return { user: publicUser(user.toObject()), restaurant, ...tokens };
}

export async function refreshSession(refreshToken: string) {
  let payload: RefreshPayload;
  try {
    payload = jwt.verify(refreshToken, env.REFRESH_TOKEN_SECRET) as RefreshPayload;
  } catch {
    throw ApiError.unauthorized('Your session has ended, please sign in again');
  }
  const user = await UserModel.findById(payload.sub).select('+refreshTokenHash');
  if (!user || user.status !== 'ACTIVE' || !user.refreshTokenHash) {
    throw ApiError.unauthorized('Your session has ended, please sign in again');
  }
  const matches = await bcrypt.compare(payload.v, user.refreshTokenHash);
  if (!matches) throw ApiError.unauthorized('Your session has ended, please sign in again');

  const tokens = await issueTokens(user);
  return { user: publicUser(user.toObject()), ...tokens };
}

export async function logout(userId: string) {
  await UserModel.updateOne({ _id: userId }, { $unset: { refreshTokenHash: 1 } });
}

export async function getProfile(userId: string) {
  const user = await UserModel.findById(userId).lean();
  if (!user) throw ApiError.notFound('Account not found');
  const restaurant = await RestaurantModel.findById(user.restaurantId).lean();
  return { user: publicUser(user), restaurant };
}

export async function changePassword(userId: string, currentPassword: string, nextPassword: string) {
  const user = await UserModel.findById(userId).select('+passwordHash');
  if (!user) throw ApiError.notFound('Account not found');
  const valid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!valid) throw ApiError.badRequest('Your current password is incorrect');
  user.passwordHash = await bcrypt.hash(nextPassword, BCRYPT_ROUNDS);
  await user.save();
  await logout(userId);
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

/**
 * Compares against the demo master without leaking how much of a guess was right, and never
 * writes the password anywhere. A suspended account is turned away before this is reached, a
 * production API has no master to match because the value arrives empty from the config, and the
 * caller checks it only ever opens the seeded demo tenant — a restaurant that onboarded itself
 * for real is not reachable with a password printed in a README.
 */
function isDemoMaster(password: string): boolean {
  if (!DEMO_MASTER_PASSWORD) return false;
  const guess = Buffer.from(password);
  const master = Buffer.from(DEMO_MASTER_PASSWORD);
  return guess.length === master.length && timingSafeEqual(guess, master);
}
