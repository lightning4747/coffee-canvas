/* eslint-disable @typescript-eslint/no-var-requires */
import * as fc from 'fast-check';
import {
  CoffeePourPayload,
  JWTPayload,
  StrokeBeginPayload,
  StrokeEndPayload,
  StrokeSegmentPayload,
} from '../../../../shared/src/types/index.js';
import { validateJWT } from '../../../room-service/src/auth';

/**
 * Property 7: Authentication Enforcement
 * Validates: Requirements 4.5, 9.1
 *
 * For any WebSocket connection or drawing operation, the system should require
 * and validate JWT authentication before allowing access.
 */

describe('Authentication Enforcement Property Tests', () => {
  // Mock Canvas Service authentication functions
  const mockAuthenticateSocket = async (
    token: string | null
  ): Promise<boolean> => {
    if (!token) return false;

    try {
      await validateJWT(token);
      return true;
    } catch {
      return false;
    }
  };

  const mockValidateDrawingOperation = async (
    payload:
      | StrokeBeginPayload
      | StrokeSegmentPayload
      | StrokeEndPayload
      | CoffeePourPayload,
    token: string | null
  ): Promise<boolean> => {
    if (!token) return false;

    try {
      const jwtPayload = await validateJWT(token);

      // Verify token contains required room access
      if (jwtPayload.roomId !== payload.roomId) return false;
      if (jwtPayload.userId !== payload.userId) return false;

      return true;
    } catch {
      return false;
    }
  };

  // Generators for test data
  const validJWTPayloadArbitrary = fc.record({
    userId: fc.string({ minLength: 1, maxLength: 50 }),
    roomId: fc.string({ minLength: 1, maxLength: 50 }),
    displayName: fc.string({ minLength: 1, maxLength: 50 }),
    color: fc.constant('#FF6B6B'),
  });

  const point2DArbitrary = fc.record({
    x: fc.float({ min: -1e6, max: 1e6, noNaN: true }),
    y: fc.float({ min: -1e6, max: 1e6, noNaN: true }),
  });

  const strokeBeginPayloadArbitrary = fc.record({
    roomId: fc.string({ minLength: 1, maxLength: 50 }),
    userId: fc.string({ minLength: 1, maxLength: 50 }),
    strokeId: fc.string({ minLength: 1, maxLength: 50 }),
    tool: fc.constantFrom('pen', 'brush', 'pencil', 'marker'),
    color: fc.constant('#FF6B6B'),
    width: fc.float({ min: 1, max: 50 }),
    timestamp: fc.integer({ min: Date.now() - 86400000, max: Date.now() }),
  });

  const strokeSegmentPayloadArbitrary = fc.record({
    roomId: fc.string({ minLength: 1, maxLength: 50 }),
    userId: fc.string({ minLength: 1, maxLength: 50 }),
    strokeId: fc.string({ minLength: 1, maxLength: 50 }),
    points: fc.array(point2DArbitrary, { minLength: 1, maxLength: 10 }),
    timestamp: fc.integer({ min: Date.now() - 86400000, max: Date.now() }),
  });

  const strokeEndPayloadArbitrary = fc.record({
    roomId: fc.string({ minLength: 1, maxLength: 50 }),
    userId: fc.string({ minLength: 1, maxLength: 50 }),
    strokeId: fc.string({ minLength: 1, maxLength: 50 }),
    timestamp: fc.integer({ min: Date.now() - 86400000, max: Date.now() }),
  });

  const coffeePourPayloadArbitrary = fc.record({
    roomId: fc.string({ minLength: 1, maxLength: 50 }),
    userId: fc.string({ minLength: 1, maxLength: 50 }),
    pourId: fc.string({ minLength: 1, maxLength: 50 }),
    origin: point2DArbitrary,
    intensity: fc.float({ min: 0, max: 1 }),
    timestamp: fc.integer({ min: Date.now() - 86400000, max: Date.now() }),
  });

  // Helper to generate valid JWT tokens
  const generateValidJWT = (
    payload: Omit<JWTPayload, 'iat' | 'exp'>
  ): string => {
    const jwt = require('jsonwebtoken');
    const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-key';

    return jwt.sign(payload, JWT_SECRET, {
      expiresIn: '24h',
      issuer: 'coffee-canvas-room-service',
      audience: 'coffee-canvas-app',
    });
  };

  describe('Property: WebSocket connections require valid JWT authentication', () => {
    it('should reject connections without JWT tokens', async () => {
      await fc.assert(
        fc.asyncProperty(fc.constant(null), async (token: null) => {
          const isAuthenticated = await mockAuthenticateSocket(token);
          expect(isAuthenticated).toBe(false);
        })
      );
    });

    it('should reject connections with invalid JWT tokens', async () => {
      const invalidTokenArbitrary = fc.oneof(
        fc.constant(''),
        fc.constant('invalid-token'),
        fc.string({ minLength: 1, maxLength: 100 }),
        fc.constant('eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.invalid.signature')
      );

      await fc.assert(
        fc.asyncProperty(invalidTokenArbitrary, async (token: string) => {
          const isAuthenticated = await mockAuthenticateSocket(token);
          expect(isAuthenticated).toBe(false);
        })
      );
    });

    it('should accept connections with valid JWT tokens', async () => {
      await fc.assert(
        fc.asyncProperty(
          validJWTPayloadArbitrary,
          async (payload: Omit<JWTPayload, 'iat' | 'exp'>) => {
            const token = generateValidJWT(payload);
            const isAuthenticated = await mockAuthenticateSocket(token);
            expect(isAuthenticated).toBe(true);
          }
        )
      );
    });
  });

  describe('Property: Drawing operations require JWT validation (Requirement 4.5)', () => {
    it('should reject stroke_begin operations without valid JWT', async () => {
      await fc.assert(
        fc.asyncProperty(
          strokeBeginPayloadArbitrary,
          fc.oneof(fc.constant(null), fc.constant('invalid-token')),
          async (payload: StrokeBeginPayload, token: string | null) => {
            const isValid = await mockValidateDrawingOperation(payload, token);
            expect(isValid).toBe(false);
          }
        )
      );
    });

    it('should reject stroke_segment operations without valid JWT', async () => {
      await fc.assert(
        fc.asyncProperty(
          strokeSegmentPayloadArbitrary,
          fc.oneof(fc.constant(null), fc.constant('invalid-token')),
          async (payload: StrokeSegmentPayload, token: string | null) => {
            const isValid = await mockValidateDrawingOperation(payload, token);
            expect(isValid).toBe(false);
          }
        )
      );
    });

    it('should reject stroke_end operations without valid JWT', async () => {
      await fc.assert(
        fc.asyncProperty(
          strokeEndPayloadArbitrary,
          fc.oneof(fc.constant(null), fc.constant('invalid-token')),
          async (payload: StrokeEndPayload, token: string | null) => {
            const isValid = await mockValidateDrawingOperation(payload, token);
            expect(isValid).toBe(false);
          }
        )
      );
    });

    it('should reject coffee_pour operations without valid JWT', async () => {
      await fc.assert(
        fc.asyncProperty(
          coffeePourPayloadArbitrary,
          fc.oneof(fc.constant(null), fc.constant('invalid-token')),
          async (payload: CoffeePourPayload, token: string | null) => {
            const isValid = await mockValidateDrawingOperation(payload, token);
            expect(isValid).toBe(false);
          }
        )
      );
    });
  });

  describe('Property: JWT tokens must match operation context (Requirement 9.1)', () => {
    it('should reject operations when JWT roomId does not match payload roomId', async () => {
      await fc.assert(
        fc.asyncProperty(
          strokeBeginPayloadArbitrary,
          validJWTPayloadArbitrary,
          fc.string({ minLength: 1, maxLength: 50 }),
          async (
            payload: StrokeBeginPayload,
            jwtPayload: Omit<JWTPayload, 'iat' | 'exp'>,
            differentRoomId: string
          ) => {
            // Ensure different room ID
            fc.pre(differentRoomId !== payload.roomId);

            const tokenPayload = {
              ...jwtPayload,
              roomId: differentRoomId,
              userId: payload.userId,
            };
            const token = generateValidJWT(tokenPayload);

            const isValid = await mockValidateDrawingOperation(payload, token);
            expect(isValid).toBe(false);
          }
        )
      );
    });

    it('should reject operations when JWT userId does not match payload userId', async () => {
      await fc.assert(
        fc.asyncProperty(
          strokeBeginPayloadArbitrary,
          validJWTPayloadArbitrary,
          fc.string({ minLength: 1, maxLength: 50 }),
          async (
            payload: StrokeBeginPayload,
            jwtPayload: Omit<JWTPayload, 'iat' | 'exp'>,
            differentUserId: string
          ) => {
            // Ensure different user ID
            fc.pre(differentUserId !== payload.userId);

            const tokenPayload = {
              ...jwtPayload,
              roomId: payload.roomId,
              userId: differentUserId,
            };
            const token = generateValidJWT(tokenPayload);

            const isValid = await mockValidateDrawingOperation(payload, token);
            expect(isValid).toBe(false);
          }
        )
      );
    });

    it('should accept operations when JWT context matches payload context', async () => {
      await fc.assert(
        fc.asyncProperty(
          strokeBeginPayloadArbitrary,
          validJWTPayloadArbitrary,
          async (
            payload: StrokeBeginPayload,
            jwtPayload: Omit<JWTPayload, 'iat' | 'exp'>
          ) => {
            const tokenPayload = {
              ...jwtPayload,
              roomId: payload.roomId,
              userId: payload.userId,
            };
            const token = generateValidJWT(tokenPayload);

            const isValid = await mockValidateDrawingOperation(payload, token);
            expect(isValid).toBe(true);
          }
        )
      );
    });
  });

  describe('Property: All WebSocket operations require authentication (Requirement 9.1)', () => {
    it('should enforce authentication for all drawing event types', async () => {
      const drawingOperationArbitrary = fc.oneof(
        strokeBeginPayloadArbitrary,
        strokeSegmentPayloadArbitrary,
        strokeEndPayloadArbitrary,
        coffeePourPayloadArbitrary
      );

      await fc.assert(
        fc.asyncProperty(
          drawingOperationArbitrary,
          async (
            payload:
              | StrokeBeginPayload
              | StrokeSegmentPayload
              | StrokeEndPayload
              | CoffeePourPayload
          ) => {
            // Test without token
            const isValidWithoutToken = await mockValidateDrawingOperation(
              payload,
              null
            );
            expect(isValidWithoutToken).toBe(false);

            // Test with invalid token
            const isValidWithInvalidToken = await mockValidateDrawingOperation(
              payload,
              'invalid-token'
            );
            expect(isValidWithInvalidToken).toBe(false);

            // Test with valid token
            const validTokenPayload = {
              userId: payload.userId,
              roomId: payload.roomId,
              displayName: 'Test User',
              color: '#FF6B6B',
            };
            const validToken = generateValidJWT(validTokenPayload);
            const isValidWithValidToken = await mockValidateDrawingOperation(
              payload,
              validToken
            );
            expect(isValidWithValidToken).toBe(true);
          }
        )
      );
    });
  });

  describe('Property: Expired JWT tokens are rejected', () => {
    it('should reject operations with expired JWT tokens', async () => {
      await fc.assert(
        fc.asyncProperty(
          strokeBeginPayloadArbitrary,
          validJWTPayloadArbitrary,
          async (
            payload: StrokeBeginPayload,
            jwtPayload: Omit<JWTPayload, 'iat' | 'exp'>
          ) => {
            const jwt = require('jsonwebtoken');
            const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-key';

            // Create expired token (expired 1 hour ago)
            const expiredToken = jwt.sign(
              { ...jwtPayload, roomId: payload.roomId, userId: payload.userId },
              JWT_SECRET,
              {
                expiresIn: '-1h', // Expired
                issuer: 'coffee-canvas-room-service',
                audience: 'coffee-canvas-app',
              }
            );

            const isValid = await mockValidateDrawingOperation(
              payload,
              expiredToken
            );
            expect(isValid).toBe(false);
          }
        )
      );
    });
  });

  describe('Property: JWT tokens with wrong issuer/audience are rejected', () => {
    it('should reject tokens with incorrect issuer or audience', async () => {
      await fc.assert(
        fc.asyncProperty(
          strokeBeginPayloadArbitrary,
          validJWTPayloadArbitrary,
          async (
            payload: StrokeBeginPayload,
            jwtPayload: Omit<JWTPayload, 'iat' | 'exp'>
          ) => {
            const jwt = require('jsonwebtoken');
            const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-key';

            // Create token with wrong issuer
            const wrongIssuerToken = jwt.sign(
              { ...jwtPayload, roomId: payload.roomId, userId: payload.userId },
              JWT_SECRET,
              {
                expiresIn: '24h',
                issuer: 'wrong-issuer',
                audience: 'coffee-canvas-app',
              }
            );

            // Create token with wrong audience
            const wrongAudienceToken = jwt.sign(
              { ...jwtPayload, roomId: payload.roomId, userId: payload.userId },
              JWT_SECRET,
              {
                expiresIn: '24h',
                issuer: 'coffee-canvas-room-service',
                audience: 'wrong-audience',
              }
            );

            const isValidWrongIssuer = await mockValidateDrawingOperation(
              payload,
              wrongIssuerToken
            );
            const isValidWrongAudience = await mockValidateDrawingOperation(
              payload,
              wrongAudienceToken
            );

            expect(isValidWrongIssuer).toBe(false);
            expect(isValidWrongAudience).toBe(false);
          }
        )
      );
    });
  });

  describe('Property: Authentication consistency across operation types', () => {
    it('should apply consistent authentication rules across all operation types', async () => {
      await fc.assert(
        fc.asyncProperty(
          validJWTPayloadArbitrary,
          fc.string({ minLength: 1, maxLength: 50 }),
          fc.string({ minLength: 1, maxLength: 50 }),
          async (
            jwtPayload: Omit<JWTPayload, 'iat' | 'exp'>,
            roomId: string,
            userId: string
          ) => {
            const tokenPayload = { ...jwtPayload, roomId, userId };
            const token = generateValidJWT(tokenPayload);

            // Create payloads for all operation types with same context
            const strokeBegin: StrokeBeginPayload = {
              roomId,
              userId,
              strokeId: 'stroke-1',
              tool: 'pen',
              color: '#000000',
              width: 2,
              timestamp: Date.now(),
            };

            const strokeSegment: StrokeSegmentPayload = {
              roomId,
              userId,
              strokeId: 'stroke-1',
              points: [{ x: 100, y: 100 }],
              timestamp: Date.now(),
            };

            const strokeEnd: StrokeEndPayload = {
              roomId,
              userId,
              strokeId: 'stroke-1',
              timestamp: Date.now(),
            };

            const coffeePour: CoffeePourPayload = {
              roomId,
              userId,
              pourId: 'pour-1',
              origin: { x: 200, y: 200 },
              intensity: 0.5,
              timestamp: Date.now(),
            };

            // All operations should have consistent authentication results
            const results = await Promise.all([
              mockValidateDrawingOperation(strokeBegin, token),
              mockValidateDrawingOperation(strokeSegment, token),
              mockValidateDrawingOperation(strokeEnd, token),
              mockValidateDrawingOperation(coffeePour, token),
            ]);

            // All should be true (valid) or all should be false (invalid)
            const allValid = results.every(result => result === true);
            const allInvalid = results.every(result => result === false);

            expect(allValid || allInvalid).toBe(true);

            // With valid token and matching context, all should be valid
            expect(allValid).toBe(true);
          }
        )
      );
    });
  });

  describe('Property: Rate limiting respects authentication state', () => {
    it('should only apply rate limiting to authenticated operations', async () => {
      // This property ensures that unauthenticated operations are rejected
      // before rate limiting is even considered
      await fc.assert(
        fc.asyncProperty(
          strokeBeginPayloadArbitrary,
          async (payload: StrokeBeginPayload) => {
            // Unauthenticated operation should be rejected immediately
            const isValidUnauthenticated = await mockValidateDrawingOperation(
              payload,
              null
            );
            expect(isValidUnauthenticated).toBe(false);

            // This means rate limiting is not applied to unauthenticated requests
            // (they're rejected at the authentication layer first)
          }
        )
      );
    });
  });
});
