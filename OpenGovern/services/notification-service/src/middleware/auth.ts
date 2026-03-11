/**
 * requireAuth middleware for notification-service.
 * Verifies RS256 JWT issued by auth-service.
 */

import { Request, Response, NextFunction } from 'express';
import { createVerify } from 'crypto';
import axios from 'axios';
import { env } from '../config/env';

export interface AuthUser {
  id: string;
  email: string;
  role: string;
  iat: number;
  exp: number;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

let cachedPublicKey: string | null = null;
let keyFetchedAt = 0;
const KEY_TTL_MS = 60 * 60 * 1_000;

async function getPublicKey(): Promise<string> {
  if (cachedPublicKey && Date.now() - keyFetchedAt < KEY_TTL_MS) return cachedPublicKey;
  const res = await axios.get<{ publicKey: string }>(env.JWT_PUBLIC_KEY_URL, { timeout: 5_000 });
  cachedPublicKey = res.data.publicKey;
  keyFetchedAt = Date.now();
  return cachedPublicKey;
}

function base64UrlDecode(str: string): Buffer {
  const padded = str + '='.repeat((4 - (str.length % 4)) % 4);
  return Buffer.from(padded.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

function verifyJwt(token: string, publicKey: string): AuthUser {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Invalid JWT format');
  const [h, p, s] = parts;
  const verifier = createVerify('SHA256');
  verifier.update(`${h}.${p}`);
  if (!verifier.verify(publicKey, base64UrlDecode(s))) {
    throw new Error('JWT signature invalid');
  }
  const payload = JSON.parse(base64UrlDecode(p).toString('utf8')) as AuthUser;
  if (payload.exp && payload.exp * 1000 < Date.now()) throw new Error('JWT expired');
  return payload;
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ success: false, error: 'Missing Authorization header' });
    return;
  }
  try {
    const key = await getPublicKey();
    req.user = verifyJwt(header.slice(7), key);
    next();
  } catch (err) {
    cachedPublicKey = null;
    res.status(401).json({ success: false, error: err instanceof Error ? err.message : 'Unauthorized' });
  }
}
