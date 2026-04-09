/**
 * JWT Verification Utility for the Canvas Service.
 * Allows the Socket.IO server to authenticate incoming connections
 * using tokens issued by the Room Service.
 */

import jwt from 'jsonwebtoken';
import { JWTPayload } from '../../../shared/src';

/** Secret key used for verifying JWT signatures. */
const JWT_SECRET =
  process.env.JWT_SECRET ||
  (process.env.NODE_ENV === 'production'
    ? (() => {
        throw new Error('JWT_SECRET must be set in production');
      })()
    : 'dev-secret-key');

/**
 * Validates and decodes a JWT issued by the Room Service.
 * Ensures the token is signed correctly and contains all required identity fields.
 *
 * @param token - The raw JWT string typically from the 'auth' object in Socket.IO.
 * @returns Promise resolving to the validated JWTPayload.
 * @throws Error if the token is invalid, expired, or malformed.
 */
export function validateJWT(token: string): Promise<JWTPayload> {
  // Support mock token for development if not fully integrated
  if (process.env.NODE_ENV !== 'production' && token === 'mock-jwt-token') {
    return Promise.resolve({
      userId: 'mock-user-id',
      roomId: 'dev-room-123',
      displayName: 'Mock User',
      color: '#8b5cf6',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 86400,
    });
  }

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

        // Verify that the payload contains essential user and room identifiers
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
