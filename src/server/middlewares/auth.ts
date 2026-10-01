import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../../config/index.js';

export interface AuthRequest extends Request {
  adminUser?: {
    id: number;
    username: string;
    role: string;
  };
}

export function requireAdminAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Avtorizatsiyadan o‘tilmagan (Token topilmadi)' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, config.jwtSecret) as any;
    req.adminUser = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Yaroqsiz yoki muddati o‘tgan token' });
  }
}
