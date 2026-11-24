export const BOARD_SIZE = 5;
export const TARGET = 2048;

export type Direction = 'up' | 'down' | 'left' | 'right';

interface Position {
  readonly tiles: readonly number[];
  readonly score: number;
}

export interface GameState extends Position {
  readonly previous: Position | null;
  readonly undoAvailable: boolean;
}

const cellIndex = (direction: Direction, line: number, offset: number): number => {
  switch (direction) {
    case 'left':
      return line * BOARD_SIZE + offset;
    case 'right':
      return line * BOARD_SIZE + BOARD_SIZE - 1 - offset;
    case 'up':
      return offset * BOARD_SIZE + line;
    case 'down':
      return (BOARD_SIZE - 1 - offset) * BOARD_SIZE + line;
    default:
      throw new Error('Invalid move direction');
  }
};

export const slideTiles = (tiles: readonly number[], direction: Direction) => {
  const moved = Array<number>(BOARD_SIZE ** 2).fill(0);
  let addedScore = 0;

  for (let line = 0; line < BOARD_SIZE; line++) {
    const positions = Array.from({ length: BOARD_SIZE }, (_, offset) => cellIndex(direction, line, offset));
    const values = positions.map((index) => tiles[index]).filter((tile) => tile !== 0);
    let destination = 0;

    for (let offset = 0; offset < values.length; offset++) {
      const value = values[offset];
      if (value === values[offset + 1]) {
        moved[positions[destination]] = value * 2;
        addedScore += value * 2;
        offset++;
      } else {
        moved[positions[destination]] = value;
      }
      destination++;
    }
  }

  const changed = moved.some((tile, index) => tile !== tiles[index]);
  return { tiles: changed ? moved : tiles, addedScore };
};

const addTile = (tiles: readonly number[], random: () => number) => {
  const empty: number[] = [];
  tiles.forEach((tile, index) => {
    if (tile === 0) empty.push(index);
  });
  if (empty.length === 0) return tiles;

  const updated = [...tiles];
  const index = empty[Math.floor(random() * empty.length)];
  updated[index] = random() < 0.9 ? 2 : 4;
  return updated;
};

export const createGame = (random = Math.random): GameState => {
  const empty = Array<number>(BOARD_SIZE ** 2).fill(0);
  const tiles = addTile(addTile(empty, random), random);
  return {
    tiles, score: 0, previous: null, undoAvailable: true,
  };
};

export const playMove = (game: GameState, direction: Direction, random = Math.random): GameState => {
  const moved = slideTiles(game.tiles, direction);
  if (moved.tiles === game.tiles) return game;

  return {
    tiles: addTile(moved.tiles, random),
    score: game.score + moved.addedScore,
    previous: game.undoAvailable ? { tiles: game.tiles, score: game.score } : null,
    undoAvailable: game.undoAvailable,
  };
};

export const undoMove = (game: GameState): GameState => {
  if (!game.undoAvailable || !game.previous) return game;

  return {
    ...game.previous,
    previous: null,
    undoAvailable: false,
  };
};

export const hasMove = (tiles: readonly number[]) => {
  if (tiles.includes(0)) return tiles.some((tile) => tile !== 0);

  return tiles.some((tile, index) => (
    ((index + 1) % BOARD_SIZE !== 0 && tile === tiles[index + 1])
    || tile === tiles[index + BOARD_SIZE]
  ));
};
