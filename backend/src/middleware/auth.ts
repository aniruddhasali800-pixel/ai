import jwt from 'jsonwebtoken';
import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env';
import { UserModel } from '../models';
import { ApiError } from '../utils/httpError';
import type { Role } from '../types/constants';

export interface AccessPayload {
  sub: string;
  rid: string;
  role: Role;
  name: string;
}

export function signAccessToken(payload: AccessPayload): string {
  const expiresIn = env.ACCESS_TOKEN_TTL as jwt.SignOptions['expiresIn'];
  return jwt.sign(payload, env.ACCESS_TOKEN_SECRET, { expiresIn });
}

export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const header = req.headers.authorization;
    const token = header && header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) throw ApiError.unauthorized();

    let payload: AccessPayload;
    try {
      payload = jwt.verify(token, env.ACCESS_TOKEN_SECRET) as AccessPayload;
    } catch {
      throw ApiError.unauthorized('Session expired, please sign in again');
    }

    // Scope is always re-derived from the database, never from client input.
    const user = await UserModel.findById(payload.sub).select('name role status restaurantId').lean();
    if (!user) throw ApiError.unauthorized('Account not found');
    if (user.status !== 'ACTIVE') throw ApiError.forbidden('Account is suspended');

    req.auth = {
      userId: String(user._id),
      restaurantId: String(user.restaurantId),
      role: user.role,
      name: user.name,
    };
    next();
  } catch (err) {
    next(err);
  }
}
