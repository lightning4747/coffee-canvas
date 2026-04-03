import { Room, User } from '../../../../shared/src/types/index';
import { extractJWTFromRequest, generateJWT, validateJWT } from '../auth';

describe('Room Service Core Functionality', () => {
  const mockUser: User = {
    id: 'user-123',
    displayName: 'Test User',
    color: '#FF6B6B',
    joinedAt: new Date('2024-01-01T00:00:00Z'),
  };

  const mockRoom: Room = {
    id: 'room-456',
    code: 'ABC123',
    name: 'Test Room',
    capacity: 10,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    participantCount: 1,
  };

  describe('JWT Token Generation and Validation', () => {
    describe('generateJWT', () => {
      it('should generate valid JWT with correct payload structure', () => {
        const token = generateJWT(mockUser, mockRoom);

        expect(typeof token).toBe('string');
        expect(token.split('.')).toHaveLength(3); // JWT has header.payload.signature
      });

      it('should include all required user and room information', async () => {
        const token = generateJWT(mockUser, mockRoom);
        const payload = await validateJWT(token);

        expect(payload.userId).toBe(mockUser.id);
        expect(payload.roomId).toBe(mockRoom.id);
        expect(payload.displayName).toBe(mockUser.displayName);
        expect(payload.color).toBe(mockUser.color);
        expect(payload.iat).toBeDefined();
        expect(payload.exp).toBeDefined();
      });

      it('should generate different tokens for different users', () => {
        const user2: User = {
          ...mockUser,
          id: 'user-456',
          displayName: 'User 2',
        };

        const token1 = generateJWT(mockUser, mockRoom);
        const token2 = generateJWT(user2, mockRoom);

        expect(token1).not.toBe(token2);
      });

      it('should generate tokens with proper expiration', async () => {
        const token = generateJWT(mockUser, mockRoom);
        const payload = await validateJWT(token);

        const now = Math.floor(Date.now() / 1000);
        const expectedExpiry = now + 24 * 60 * 60; // 24 hours

        expect(payload.exp).toBeGreaterThan(now);
        expect(payload.exp).toBeLessThanOrEqual(expectedExpiry + 10); // Allow 10 second tolerance
      });
    });

    describe('validateJWT', () => {
      it('should validate correctly formatted JWT tokens', async () => {
        const token = generateJWT(mockUser, mockRoom);
        const payload = await validateJWT(token);

        expect(payload).toBeDefined();
        expect(payload.userId).toBe(mockUser.id);
      });

      it('should reject completely invalid tokens', async () => {
        await expect(validateJWT('invalid-token')).rejects.toThrow(
          'Invalid JWT'
        );
      });

      it('should reject malformed JWT structure', async () => {
        await expect(validateJWT('not.a.jwt')).rejects.toThrow('Invalid JWT');
      });

      it('should reject tokens with wrong issuer', async () => {
        const jwt = await import('jsonwebtoken');
        const token = jwt.default.sign(
          {
            userId: 'test',
            roomId: 'test',
            displayName: 'test',
            color: '#000',
          },
          process.env.JWT_SECRET || 'dev-secret-key',
          { issuer: 'wrong-issuer' }
        );

        await expect(validateJWT(token)).rejects.toThrow('Invalid JWT');
      });

      it('should reject tokens with wrong audience', async () => {
        const jwt = await import('jsonwebtoken');
        const token = jwt.default.sign(
          {
            userId: 'test',
            roomId: 'test',
            displayName: 'test',
            color: '#000',
          },
          process.env.JWT_SECRET || 'dev-secret-key',
          {
            issuer: 'coffee-canvas-room-service',
            audience: 'wrong-audience',
          }
        );

        await expect(validateJWT(token)).rejects.toThrow('Invalid JWT');
      });

      it('should reject tokens with missing required fields', async () => {
        const jwt = await import('jsonwebtoken');
        const incompletePayload = { userId: 'test' }; // Missing roomId, displayName, color

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

      it('should reject expired tokens', async () => {
        const jwt = await import('jsonwebtoken');
        const token = jwt.default.sign(
          {
            userId: 'test',
            roomId: 'test',
            displayName: 'test',
            color: '#000',
          },
          process.env.JWT_SECRET || 'dev-secret-key',
          {
            issuer: 'coffee-canvas-room-service',
            audience: 'coffee-canvas-app',
            expiresIn: '-1h', // Expired 1 hour ago
          }
        );

        await expect(validateJWT(token)).rejects.toThrow('Invalid JWT');
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

  describe('Input Validation Edge Cases', () => {
    it('should handle malformed authorization headers', () => {
      const testCases = [
        'Bearer', // Missing token
        'InvalidFormat token', // Wrong format
        'Bearer token1 token2', // Multiple tokens
        '', // Empty header
      ];

      for (const authHeader of testCases) {
        const req = { headers: { authorization: authHeader } };
        const token = extractJWTFromRequest(req);
        expect(token).toBeNull();
      }
    });

    it('should handle case-insensitive scenarios', async () => {
      // Test that our JWT validation is case-sensitive for security
      const token = generateJWT(mockUser, mockRoom);
      const upperToken = token.toUpperCase();

      await expect(validateJWT(upperToken)).rejects.toThrow();
    });

    it('should handle special characters in user data', async () => {
      const specialUser: User = {
        ...mockUser,
        displayName: 'User with emojis 🎨 and "quotes"',
      };

      const token = generateJWT(specialUser, mockRoom);
      const payload = await validateJWT(token);

      expect(payload.displayName).toBe(specialUser.displayName);
    });

    it('should handle room names with special characters', async () => {
      const specialRoom: Room = {
        ...mockRoom,
        name: 'Room with <html> & "quotes" and newlines\n',
      };

      const token = generateJWT(mockUser, specialRoom);
      const payload = await validateJWT(token);

      // Room name is not included in JWT, but this tests the generation doesn't fail
      expect(payload.userId).toBe(mockUser.id);
      expect(payload.roomId).toBe(specialRoom.id);
    });
  });

  describe('Security Edge Cases', () => {
    it('should not accept tokens with null bytes', async () => {
      const maliciousToken =
        'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJ1c2VySWQiOiJ0ZXN0XHUwMDAwIiwicm9vbUlkIjoidGVzdCIsImRpc3BsYXlOYW1lIjoidGVzdCIsImNvbG9yIjoiIzAwMCJ9.invalid';

      await expect(validateJWT(maliciousToken)).rejects.toThrow();
    });

    it('should handle very long tokens gracefully', async () => {
      const longString = 'a'.repeat(10000);

      await expect(validateJWT(longString)).rejects.toThrow();
    });

    it('should handle empty string token', async () => {
      await expect(validateJWT('')).rejects.toThrow();
    });

    it('should handle null/undefined tokens', async () => {
      await expect(validateJWT(null as unknown as string)).rejects.toThrow();
      await expect(
        validateJWT(undefined as unknown as string)
      ).rejects.toThrow();
    });
  });

  describe('Performance and Limits', () => {
    it('should handle multiple concurrent token validations', async () => {
      const token = generateJWT(mockUser, mockRoom);

      // Create 10 concurrent validation promises
      const validationPromises = Array(10)
        .fill(null)
        .map(() => validateJWT(token));

      const results = await Promise.all(validationPromises);

      // All should succeed and return the same payload
      results.forEach(payload => {
        expect(payload.userId).toBe(mockUser.id);
        expect(payload.roomId).toBe(mockRoom.id);
      });
    });

    it('should handle token generation for users with maximum length names', () => {
      const longNameUser: User = {
        ...mockUser,
        displayName: 'a'.repeat(50), // Maximum allowed length
      };

      const token = generateJWT(longNameUser, mockRoom);
      expect(typeof token).toBe('string');
      expect(token.length).toBeGreaterThan(0);
    });
  });
});
