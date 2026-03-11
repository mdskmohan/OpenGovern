/**
 * requireAuth middleware for quality-service.
 *
 * Verifies the Bearer JWT issued by auth-service.
 * On success, attaches decoded payload to req.user.
 * On failure, responds 401.
 *
 * Token verification uses the RS256 public key fetched from auth-service at startup.
 * The key is cached in module scope and refreshed on 401s.
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

// ---------------------------------------------------------------------------
// Public key cache
// ---------------------------------------------------------------------------

let cachedPublicKey: string | null = null;
let keyFetchedAt = 0;
const KEY_TTL_MS = 60 * 60 * 1_000; // 1 hour

async function getPublicKey(): Promise<string> {
  const now = Date.now();
  if (cachedPublicKey && now - keyFetchedAt < KEY_TTL_MS) {
    return cachedPublicKey;
  }

  const response = await axios.get<{ publicKey: string }>(env.JWT_PUBLIC_KEY_URL, {
    timeout: 5_000,
  });
  cachedPublicKey = response.data.publicKey;
  keyFetchedAt = now;
  return cachedPublicKey;
}

// ---------------------------------------------------------------------------
// JWT decode + verify (RS256, no external jwt library dependency)
// ---------------------------------------------------------------------------

function base64UrlDecode(str: string): Buffer {
  // Pad and convert base64url to base64
  const padded = str + '='.repeat((4 - (str.length % 4)) % 4);
  return Buffer.from(padded.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

function verifyJwt(token: string, publicKey: string): AuthUser {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Invalid JWT format');

  const [headerB64, payloadB64, signatureB64] = parts;
  const signingInput = `${headerB64}.${payloadB64}`;

  const verifier = createVerify('SHA256');
  verifier.update(signingInput);
  const signature = base64UrlDecode(signatureB64);

  const valid = verifier.verify(publicKey, signature);
  if (!valid) throw new Error('JWT signature verification failed');

  const payload = JSON.parse(base64UrlDecode(payloadB64).toString('utf8')) as AuthUser;

  if (payload.exp && payload.exp * 1000 < Date.now()) {
    throw new Error('JWT has expired');
  }

  return payload;
}

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ success: false, error: 'Missing or invalid Authorization header' });
    return;
  }

  const token = authHeader.slice(7);

  try {
    const publicKey = await getPublicKey();
    const user = verifyJwt(token, publicKey);
    req.user = user;
    next();
  } catch (err) {
    // If key fetch failed or token invalid, clear cache and try once more
    cachedPublicKey = null;
    const message = err instanceof Error ? err.message : 'Authentication failed';
    res.status(401).json({ success: false, error: message });
  }
}
