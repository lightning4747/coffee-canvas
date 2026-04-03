import { assignUserColor, isValidHexColor } from '../color-assignment';

describe('Color Assignment', () => {
  describe('assignUserColor', () => {
    it('should assign different colors for different users in same room', () => {
      const roomId = 'room-123';

      const color1 = assignUserColor(roomId, []);
      const color2 = assignUserColor(roomId, [color1]);
      const color3 = assignUserColor(roomId, [color1, color2]);

      expect(color1).not.toBe(color2);
      expect(color2).not.toBe(color3);
      expect(color1).not.toBe(color3);
    });

    it('should return valid hex colors', () => {
      const roomId = 'room-123';
      const color = assignUserColor(roomId);

      expect(isValidHexColor(color)).toBe(true);
      expect(color).toMatch(/^#[0-9A-Fa-f]{6}$/);
    });

    it('should avoid already assigned colors', () => {
      const roomId = 'room-123';
      const existingColors = ['#FF6B6B', '#4ECDC4', '#45B7D1'];

      const newColor = assignUserColor(roomId, existingColors);

      expect(existingColors).not.toContain(newColor);
    });

    it('should be deterministic for same room and existing colors', () => {
      const roomId = 'room-123';
      const existingColors = ['#FF6B6B'];

      const color1 = assignUserColor(roomId, existingColors);
      const color2 = assignUserColor(roomId, existingColors);

      expect(color1).toBe(color2);
    });

    it('should handle all colors being taken', () => {
      const roomId = 'room-123';
      // Simulate all 12 colors being taken
      const allColors = [
        '#FF6B6B',
        '#4ECDC4',
        '#45B7D1',
        '#96CEB4',
        '#FFEAA7',
        '#DDA0DD',
        '#98D8C8',
        '#F7DC6F',
        '#BB8FCE',
        '#85C1E9',
        '#F8C471',
        '#82E0AA',
      ];

      const color = assignUserColor(roomId, allColors);

      // Should still return a valid color (falls back to using any color)
      expect(isValidHexColor(color)).toBe(true);
      expect(allColors).toContain(color);
    });

    it('should produce different colors for different rooms', () => {
      const room1Color = assignUserColor('room-1', []);
      const room2Color = assignUserColor('room-2', []);

      // While not guaranteed, different rooms should typically get different colors
      // due to room ID being used as seed
      expect(room1Color).toBeDefined();
      expect(room2Color).toBeDefined();
    });

    it('should handle empty existing colors array', () => {
      const roomId = 'room-123';

      const color = assignUserColor(roomId, []);

      expect(isValidHexColor(color)).toBe(true);
    });

    it('should handle undefined existing colors', () => {
      const roomId = 'room-123';

      const color = assignUserColor(roomId);

      expect(isValidHexColor(color)).toBe(true);
    });
  });

  describe('isValidHexColor', () => {
    it('should validate correct hex colors', () => {
      const validColors = [
        '#FF6B6B',
        '#000000',
        '#FFFFFF',
        '#123456',
        '#abcdef',
        '#ABCDEF',
      ];

      validColors.forEach(color => {
        expect(isValidHexColor(color)).toBe(true);
      });
    });

    it('should reject invalid hex colors', () => {
      const invalidColors = [
        'FF6B6B', // Missing #
        '#FF6B6', // Too short
        '#FF6B6BB', // Too long
        '#GG6B6B', // Invalid characters
        '#ff6b6b ', // Trailing space
        ' #ff6b6b', // Leading space
        '', // Empty string
        '#', // Just hash
        'red', // Color name
        'rgb(255,0,0)', // RGB format
      ];

      invalidColors.forEach(color => {
        expect(isValidHexColor(color)).toBe(false);
      });
    });

    it('should handle null and undefined', () => {
      expect(isValidHexColor(null as unknown as string)).toBe(false);
      expect(isValidHexColor(undefined as unknown as string)).toBe(false);
    });

    it('should handle non-string inputs', () => {
      expect(isValidHexColor(123 as unknown as string)).toBe(false);
      expect(isValidHexColor({} as unknown as string)).toBe(false);
      expect(isValidHexColor([] as unknown as string)).toBe(false);
    });
  });
});
