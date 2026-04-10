/**
 * Authentication and JWT management for the Room Service.
 * Provides functions for generating, validating, and extracting
 * JSON Web Tokens used for room access control.
 */

import jwt from 'jsonwebtoken';
import { JWTPayload, Room, User } from '../../../shared/src/types/index';

/** Secret key used for signing and verifying JWTs. */
const JWT_SECRET =
  process.env.JWT_SECRET ||
  (process.env.NODE_ENV === 'production'
    ? (() => {
        throw new Error('JWT_SECRET must be set in production');
      })()
    : 'dev-secret-key');

/** Standard expiration duration for room access tokens. */
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';

/**
 * Encapsulated user and room context derived from a valid JWT.
 */
export interface JWTContext {
  userId: string;
  roomId: string;
  displayName: string;
  color: string;
}

/**
 * Signs a new JWT for a user entering a specific room.
 *
 * @param user - The authenticated user object.
 * @param room - The room the user is joining.
 * @returns A signed JWT string.
 */
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

/**
 * Verifies and decodes a JWT string into a typed payload.
 *
 * @param token - The raw Bearer token string.
 * @returns Promise resolving to the validated JWTPayload.
 * @throws Error if the token is expired, tampered with, or missing fields.
 */
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

        // Validate required fields for the application
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

/**
 * Helper to extract a Bearer token from the HTTP Authorization header.
 *
 * @param req - Object containing request headers.
 * @returns The token string if found and correctly formatted, otherwise null.
 */
export function extractJWTFromRequest(req: {
  headers: { authorization?: string };
}): string | null {
  const authHeader = req.headers.authorization;
  if (!authHeader) return null;

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') return null;

  return parts[1];
}
