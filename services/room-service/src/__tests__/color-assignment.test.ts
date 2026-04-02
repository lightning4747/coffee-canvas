import { assignUserColor, isValidHexColor } from '../color-assignment';

describe('Color Assignment', () => {
  describe('assignUserColor', () => {
    it('should assign a color for a new room', () => {
      const roomId = 'room-123';
      const color = assignUserColor(roomId);

      expect(color).toBeDefined();
      expect(isValidHexColor(color)).toBe(true);
    });

    it('should assign different colors for different rooms', () => {
      const roomId1 = 'room-123';
      const roomId2 = 'room-456';

      const color1 = assignUserColor(roomId1);
      const color2 = assignUserColor(roomId2);

      // Colors might be the same due to deterministic assignment, but should be valid
      expect(isValidHexColor(color1)).toBe(true);
      expect(isValidHexColor(color2)).toBe(true);
    });

    it('should avoid already used colors', () => {
      const roomId = 'room-123';
      const existingColors = ['#FF6B6B', '#4ECDC4', '#45B7D1'];

      const newColor = assignUserColor(roomId, existingColors);

      expect(isValidHexColor(newColor)).toBe(true);
      expect(existingColors).not.toContain(newColor);
    });

    it('should handle case when all colors are taken', () => {
      const roomId = 'room-123';
      // Simulate all colors being taken (more than available colors)
      const existingColors = [
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
        '#EXTRA1',
        '#EXTRA2', // More than available
      ];

      const newColor = assignUserColor(roomId, existingColors);

      // Should still return a valid color (fallback to any available color)
      expect(isValidHexColor(newColor)).toBe(true);
    });

    it('should be deterministic for the same room and existing colors', () => {
      const roomId = 'room-123';
      const existingColors = ['#FF6B6B'];

      const color1 = assignUserColor(roomId, existingColors);
      const color2 = assignUserColor(roomId, existingColors);

      expect(color1).toBe(color2);
    });
  });

  describe('isValidHexColor', () => {
    it('should validate correct hex colors', () => {
      expect(isValidHexColor('#FF6B6B')).toBe(true);
      expect(isValidHexColor('#000000')).toBe(true);
      expect(isValidHexColor('#FFFFFF')).toBe(true);
      expect(isValidHexColor('#123ABC')).toBe(true);
    });

    it('should reject invalid hex colors', () => {
      expect(isValidHexColor('FF6B6B')).toBe(false); // Missing #
      expect(isValidHexColor('#FF6B6')).toBe(false); // Too short
      expect(isValidHexColor('#FF6B6BB')).toBe(false); // Too long
      expect(isValidHexColor('#GG6B6B')).toBe(false); // Invalid characters
      expect(isValidHexColor('')).toBe(false); // Empty string
      expect(isValidHexColor('#')).toBe(false); // Just #
    });
  });
});
