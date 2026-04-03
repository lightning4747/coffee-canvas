import jwt from 'jsonwebtoken';
import { JWTPayload, Room, User } from '../../../shared/src/types/index.js';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-key';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';

export interface JWTContext {
  userId: string;
  roomId: string;
  displayName: string;
  color: string;
}

export function generateJWT(user: User, room: Room): string {
  const payload: Omit<JWTPayload, 'iat' | 'exp'> = {
    userId: user.id,
    roomId: room.id,
    displayName: user.displayName,
    color: user.color,
  };

  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
    issuer: 'coffee-canvas-room-service',
    audience: 'coffee-canvas-app',
  } as jwt.SignOptions);
}

export function validateJWT(token: string): Promise<JWTPayload> {
  return new Promise((resolve, reject) => {
    jwt.verify(
      token,
      JWT_SECRET,
      {
        issuer: 'coffee-canvas-room-service',
        audience: 'coffee-canvas-app',
      },
      (err, decoded) => {
        if (err) {
          reject(new Error(`Invalid JWT: ${err.message}`));
          return;
        }

        if (!decoded || typeof decoded !== 'object') {
          reject(new Error('Invalid JWT payload'));
          return;
        }

        const payload = decoded as JWTPayload;

        // Validate required fields
        if (
          !payload.userId ||
          !payload.roomId ||
          !payload.displayName ||
          !payload.color
        ) {
          reject(new Error('Missing required JWT fields'));
          return;
        }

        resolve(payload);
      }
    );
  });
}

export function extractJWTFromRequest(req: {
  headers: { authorization?: string };
}): string | null {
  const authHeader = req.headers.authorization;
  if (!authHeader) return null;

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') return null;

  return parts[1];
}
