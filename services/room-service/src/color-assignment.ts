// User color assignment utilities

const USER_COLORS = [
  '#FF6B6B', // Red
  '#4ECDC4', // Teal
  '#45B7D1', // Blue
  '#96CEB4', // Green
  '#FFEAA7', // Yellow
  '#DDA0DD', // Plum
  '#98D8C8', // Mint
  '#F7DC6F', // Light Yellow
  '#BB8FCE', // Light Purple
  '#85C1E9', // Light Blue
  '#F8C471', // Orange
  '#82E0AA', // Light Green
];

export function assignUserColor(
  roomId: string,
  existingColors: string[] = []
): string {
  // Filter out colors already in use
  const availableColors = USER_COLORS.filter(
    color => !existingColors.includes(color)
  );

  // If all colors are taken, use a random one (shouldn't happen with 12 colors and max 50 users)
  const colorsToChooseFrom =
    availableColors.length > 0 ? availableColors : USER_COLORS;

  // Use room ID as seed for deterministic but varied color selection
  const roomSeed = roomId
    .split('')
    .reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const colorIndex =
    (roomSeed + existingColors.length) % colorsToChooseFrom.length;

  return colorsToChooseFrom[colorIndex];
}

export function isValidHexColor(color: string): boolean {
  return /^#[0-9A-Fa-f]{6}$/.test(color);
}
