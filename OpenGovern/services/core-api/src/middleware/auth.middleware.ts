import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import axios from 'axios';
import { env } from '../config/env';

let cachedPublicKey: string | null = null;

async function getPublicKey(): Promise<string> {
  if (cachedPublicKey) return cachedPublicKey;
  const response = await axios.get(`${env.AUTH_SERVICE_URL}/api/v1/auth/public-key`);
  cachedPublicKey = response.data.publicKey;
  return cachedPublicKey!;
}

export const requireAuth = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'No token provided' },
      });
      return;
    }

    const publicKey = await getPublicKey();
    const payload = jwt.verify(token, publicKey, { algorithms: ['RS256'] }) as Record<string, unknown>;
    (req as any).user = payload;
    next();
  } catch (err) {
    res.status(401).json({
      success: false,
      error: { code: 'INVALID_TOKEN', message: 'Token invalid or expired' },
    });
  }
};

export const optionalAuth = async (
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (token) {
      const publicKey = await getPublicKey();
      const payload = jwt.verify(token, publicKey, { algorithms: ['RS256'] }) as Record<string, unknown>;
      (req as any).user = payload;
    }
  } catch (_) {
    // token is invalid — proceed without user context
  }
  next();
};

/** Invalidate the cached public key (useful for key rotation or tests). */
export function clearPublicKeyCache(): void {
  cachedPublicKey = null;
}
