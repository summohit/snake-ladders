export const BOARD_SIZE = 10;
export const TILE_SIZE = 1.25;
export const BOARD_SPAN = BOARD_SIZE * TILE_SIZE; // 12.5
export const BOARD_HALF = BOARD_SPAN / 2; // 6.25
export const BOARD_TOP_Y = 0.28;

export const TURN_DURATION_MS = 60_000;

export const PLAYERS_META = [
  {
    id: 0,
    key: 'ruby',
    label: 'Ruby',
    defaultName: 'Player',
    colorHex: '#ff3860',
    glowHex: '#ff7092',
    emissiveHex: '#9e1134',
    avatar: '🦊',
  },
  {
    id: 1,
    key: 'emerald',
    label: 'Emerald',
    defaultName: 'Koda',
    colorHex: '#18f084',
    glowHex: '#6effb6',
    emissiveHex: '#0a7a42',
    avatar: '🐸',
  },
  {
    id: 2,
    key: 'amber',
    label: 'Amber',
    defaultName: 'Zara',
    colorHex: '#ffbe18',
    glowHex: '#ffe066',
    emissiveHex: '#9c6600',
    avatar: '🦁',
  },
  {
    id: 3,
    key: 'sapphire',
    label: 'Sapphire',
    defaultName: 'Milo',
    colorHex: '#20c4ff',
    glowHex: '#82e2ff',
    emissiveHex: '#08608f',
    avatar: '🦜',
  },
];

export const BOT_NAMES = ['Koda', 'Zara', 'Milo', 'Tiki', 'Nala', 'Bongo'];

// 8 Classic Jungle Ladders (bottom -> top)
export const LADDERS = [
  { from: 4, to: 25, wood: '#c77d3b', glow: '#45ff9e' },
  { from: 13, to: 46, wood: '#b86b2e', glow: '#ffd84d' },
  { from: 33, to: 49, wood: '#d18742', glow: '#45ff9e' },
  { from: 42, to: 63, wood: '#bd7232', glow: '#47f3ff' },
  { from: 50, to: 69, wood: '#c97e38', glow: '#ffd84d' },
  { from: 62, to: 81, wood: '#b86c2f', glow: '#45ff9e' },
  { from: 74, to: 92, wood: '#d48d48', glow: '#ffd84d' },
  { from: 80, to: 96, wood: '#c47936', glow: '#47f3ff' },
];

// 8 Vibrant Jungle Snakes (head -> tail)
export const SNAKES = [
  { from: 27, to: 5, primary: '#ff3b5c', stripe: '#ffd166', belly: '#ffe8a3', name: 'Coral Viper' },
  { from: 40, to: 3, primary: '#a83bff', stripe: '#3df5ff', belly: '#d9c2ff', name: 'Amethyst Boa' },
  { from: 43, to: 18, primary: '#ff7a18', stripe: '#22182b', belly: '#ffe29a', name: 'Tiger Python' },
  { from: 54, to: 31, primary: '#1cd46e', stripe: '#ffee32', belly: '#c6ffdd', name: 'Emerald Mamba' },
  { from: 66, to: 45, primary: '#00b4ff', stripe: '#ff3fa4', belly: '#c2f0ff', name: 'Azure Cobra' },
  { from: 76, to: 58, primary: '#ff2e93', stripe: '#ffea54', belly: '#ffcce6', name: 'Orchid Adder' },
  { from: 89, to: 53, primary: '#ff9900', stripe: '#ff1e56', belly: '#fff0b3', name: 'Sunburst Serpent' },
  { from: 99, to: 41, primary: '#e61938', stripe: '#00ffaa', belly: '#ffb8c4', name: 'King Basilisk' },
];

export const LADDER_MAP = new Map(LADDERS.map((l) => [l.from, l]));
export const SNAKE_MAP = new Map(SNAKES.map((s) => [s.from, s]));

/**
 * Convert tile number (1..100) to 0-indexed grid row (0=bottom..9=top) and col (0=left..9=right).
 * Uses classic boustrophedon (zig-zag) numbering.
 */
export function tileToGrid(tile) {
  const clamped = Math.max(1, Math.min(100, tile));
  const zero = clamped - 1;
  const row = Math.floor(zero / BOARD_SIZE);
  const posInRow = zero % BOARD_SIZE;
  const col = row % 2 === 0 ? posInRow : BOARD_SIZE - 1 - posInRow;
  return { row, col };
}

/**
 * Convert tile (0..100) to 3D world coordinates.
 * Tile 0 places pawns on the Enchanted Jungle dock just below tile 1.
 */
export function tileToWorld(tile, playerIndex = 0) {
  if (tile <= 0) {
    const startX = -BOARD_HALF - 0.85;
    const startZ = BOARD_HALF - 0.55 - playerIndex * 0.72;
    return { x: startX, y: BOARD_TOP_Y - 0.14, z: startZ };
  }
  const { row, col } = tileToGrid(tile);
  const x = -BOARD_HALF + (col + 0.5) * TILE_SIZE;
  const z = BOARD_HALF - (row + 0.5) * TILE_SIZE;
  return { x, y: BOARD_TOP_Y, z };
}

/**
 * Neat sub-tile offset when multiple pawns occupy the same square.
 */
export function getStackOffset(indexInGroup, groupSize) {
  if (groupSize <= 1) return { dx: 0, dz: 0 };
  const radius = groupSize === 2 ? 0.24 : 0.28;
  const angle = (indexInGroup / groupSize) * Math.PI * 2 + Math.PI / 4;
  return {
    dx: Math.cos(angle) * radius,
    dz: Math.sin(angle) * radius,
  };
}

/**
 * Build a smooth S-curve 3D path from snake head (from) to tail (to).
 * Used both to sculpt the 3D snake mesh AND to slide a bitten pawn down its back!
 */
export function getSnakeCurvePoints(snake) {
  const start = tileToWorld(snake.from);
  const end = tileToWorld(snake.to);
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const len = Math.hypot(dx, dz) || 1;
  // Perpendicular vector on XZ plane
  const px = -dz / len;
  const pz = dx / len;
  const amp = Math.min(1.05, Math.max(0.48, len * 0.14));
  const waves = len > 5.5 ? 2.5 : 1.75;
  const segments = 14;
  const pts = [];

  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const sway = Math.sin(t * Math.PI * 2 * waves) * amp * Math.sin(t * Math.PI);
    const x = start.x + dx * t + px * sway;
    const z = start.z + dz * t + pz * sway;
    const arch = Math.sin(t * Math.PI) * 0.22;
    const y = BOARD_TOP_Y + 0.22 + arch;
    pts.push({ x, y, z });
  }
  return pts;
}
