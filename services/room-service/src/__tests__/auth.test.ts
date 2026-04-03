import { Room, User } from '../../../../shared/src/types/index.js';
import { extractJWTFromRequest, generateJWT, validateJWT } from '../auth';

describe('Authentication', () => {
  const mockUser: User = {
    id: 'user-123',
    displayName: 'Test User',
    color: '#FF6B6B',
    joinedAt: new Date(),
  };

  const mockRoom: Room = {
    id: 'room-456',
    code: 'ABC123',
    name: 'Test Room',
    capacity: 10,
    createdAt: new Date(),
    participantCount: 1,
  };

  describe('generateJWT', () => {
    it('should generate a valid JWT token', () => {
      const token = generateJWT(mockUser, mockRoom);
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3); // JWT has 3 parts
    });

    it('should include user and room information in token', async () => {
      const token = generateJWT(mockUser, mockRoom);
      const payload = await validateJWT(token);

      expect(payload.userId).toBe(mockUser.id);
      expect(payload.roomId).toBe(mockRoom.id);
      expect(payload.displayName).toBe(mockUser.displayName);
      expect(payload.color).toBe(mockUser.color);
    });
  });

  describe('validateJWT', () => {
    it('should validate a valid JWT token', async () => {
      const token = generateJWT(mockUser, mockRoom);
      const payload = await validateJWT(token);

      expect(payload).toBeDefined();
      expect(payload.userId).toBe(mockUser.id);
      expect(payload.roomId).toBe(mockRoom.id);
    });

    it('should reject an invalid JWT token', async () => {
      const invalidToken = 'invalid.token.here';

      await expect(validateJWT(invalidToken)).rejects.toThrow('Invalid JWT');
    });

    it('should reject a malformed JWT token', async () => {
      const malformedToken = 'not-a-jwt-token';

      await expect(validateJWT(malformedToken)).rejects.toThrow('Invalid JWT');
    });

    it('should reject a token with missing required fields', async () => {
      // Create a token with incomplete payload
      const jwt = await import('jsonwebtoken');
      const incompletePayload = { userId: 'user-123' }; // Missing roomId, displayName, color
      const token = jwt.default.sign(
        incompletePayload,
        process.env.JWT_SECRET || 'dev-secret-key',
        {
          issuer: 'coffee-canvas-room-service',
          audience: 'coffee-canvas-app',
        }
      );

      await expect(validateJWT(token)).rejects.toThrow(
        'Missing required JWT fields'
      );
    });
  });

  describe('extractJWTFromRequest', () => {
    it('should extract JWT from Authorization header', () => {
      const token = 'valid.jwt.token';
      const req = {
        headers: {
          authorization: `Bearer ${token}`,
        },
      };

      const extractedToken = extractJWTFromRequest(req);
      expect(extractedToken).toBe(token);
    });

    it('should return null if no Authorization header', () => {
      const req = { headers: {} };

      const extractedToken = extractJWTFromRequest(req);
      expect(extractedToken).toBeNull();
    });

    it('should return null if Authorization header is malformed', () => {
      const req = {
        headers: {
          authorization: 'InvalidFormat token',
        },
      };

      const extractedToken = extractJWTFromRequest(req);
      expect(extractedToken).toBeNull();
    });

    it('should return null if Authorization header is missing Bearer prefix', () => {
      const req = {
        headers: {
          authorization: 'token-without-bearer',
        },
      };

      const extractedToken = extractJWTFromRequest(req);
      expect(extractedToken).toBeNull();
    });
  });
});
