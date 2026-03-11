/**
 * Auth Middleware — governance-service
 * Validates RS256 JWT tokens issued by auth-service.
 * Public key is fetched once on startup and cached.
 */
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import axios from 'axios';
import { env } from '../config/env';

let cachedPublicKey: string | null = null;

async function getPublicKey(): Promise<string> {
  if (cachedPublicKey) return cachedPublicKey;
  const response = await axios.get(`${env.JWT_PUBLIC_KEY_URL.replace('/api/v1/auth/public-key', '')}/api/v1/auth/public-key`);
  cachedPublicKey = response.data.publicKey;
  return cachedPublicKey!;
}

export interface AuthenticatedRequest extends Request {
  user: { id: string; email: string; roles: string[]; permissions: string[] };
}

export const requireAuth = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
      return;
    }
    const publicKey = await getPublicKey();
    const payload = jwt.verify(token, publicKey, { algorithms: ['RS256'] }) as any;
    (req as AuthenticatedRequest).user = payload;
    next();
  } catch {
    res.status(401).json({ success: false, error: { code: 'INVALID_TOKEN', message: 'Token invalid or expired' } });
  }
};
