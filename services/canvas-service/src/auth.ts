import jwt from 'jsonwebtoken';
import { JWTPayload } from '@coffee-canvas/shared';

const JWT_SECRET =
  process.env.JWT_SECRET ||
  (process.env.NODE_ENV === 'production'
    ? (() => {
        throw new Error('JWT_SECRET must be set in production');
      })()
    : 'dev-secret-key');

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
