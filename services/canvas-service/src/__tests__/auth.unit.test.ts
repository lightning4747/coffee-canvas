import jwt from 'jsonwebtoken';
import { validateJWT } from '../auth';
import { JWTPayload } from '@coffee-canvas/shared';

const JWT_SECRET = 'dev-secret-key';

describe('Auth Unit Tests', () => {
  const validPayload: JWTPayload = {
    userId: 'user-1',
    roomId: 'room-1',
    displayName: 'Artist',
    color: '#ff0000',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
  };

  it('should validate a correct JWT token', async () => {
    const token = jwt.sign(validPayload, JWT_SECRET, {
      issuer: 'coffee-canvas-room-service',
      audience: 'coffee-canvas-app',
    });

    const decoded = await validateJWT(token);
    expect(decoded.userId).toBe(validPayload.userId);
    expect(decoded.roomId).toBe(validPayload.roomId);
  });

  it('should reject an expired token', async () => {
    const expiredPayload = {
      ...validPayload,
      exp: Math.floor(Date.now() / 1000) - 60,
    };
    const token = jwt.sign(expiredPayload, JWT_SECRET, {
      issuer: 'coffee-canvas-room-service',
      audience: 'coffee-canvas-app',
    });

    await expect(validateJWT(token)).rejects.toThrow(
      'Invalid JWT: jwt expired'
    );
  });

  it('should reject a token with invalid signature', async () => {
    const token = jwt.sign(validPayload, 'wrong-secret', {
      issuer: 'coffee-canvas-room-service',
      audience: 'coffee-canvas-app',
    });

    await expect(validateJWT(token)).rejects.toThrow(
      'Invalid JWT: invalid signature'
    );
  });

  it('should reject a token with missing required fields', async () => {
    const incompletePayload = {
      userId: 'user-1',
      // roomId missing
      displayName: 'Artist',
      color: '#ff0000',
      iat: validPayload.iat,
      exp: validPayload.exp,
    };

    const token = jwt.sign(incompletePayload, JWT_SECRET, {
      issuer: 'coffee-canvas-room-service',
      audience: 'coffee-canvas-app',
    });

    await expect(validateJWT(token)).rejects.toThrow(
      'Missing required JWT fields'
    );
  });

  it('should reject a token with wrong issuer', async () => {
    const token = jwt.sign(validPayload, JWT_SECRET, {
      issuer: 'wrong-issuer',
      audience: 'coffee-canvas-app',
    });

    await expect(validateJWT(token)).rejects.toThrow(
      'Invalid JWT: jwt issuer invalid'
    );
  });

  it('should reject a token with wrong audience', async () => {
    const token = jwt.sign(validPayload, JWT_SECRET, {
      issuer: 'coffee-canvas-room-service',
      audience: 'wrong-audience',
    });

    await expect(validateJWT(token)).rejects.toThrow(
      'Invalid JWT: jwt audience invalid'
    );
  });
});
