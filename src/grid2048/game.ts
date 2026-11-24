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

interface TileMovement {
  readonly from: number;
  readonly to: number;
}

export interface MovePlan {
  readonly game: GameState;
  readonly movements: readonly TileMovement[];
  readonly mergedAt: readonly number[];
  readonly spawnedAt: number | null;
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

const traceSlide = (tiles: readonly number[], direction: Direction) => {
  const moved = Array<number>(BOARD_SIZE ** 2).fill(0);
  const movements: TileMovement[] = [];
  const mergedAt: number[] = [];
  let addedScore = 0;

  for (let line = 0; line < BOARD_SIZE; line++) {
    const positions = Array.from({ length: BOARD_SIZE }, (_, offset) => cellIndex(direction, line, offset));
    const filled = positions.filter((index) => tiles[index] !== 0);
    let destination = 0;

    for (let offset = 0; offset < filled.length; offset++) {
      const from = filled[offset];
      const to = positions[destination];
      const value = tiles[from];
      const neighbor = filled[offset + 1];
      movements.push({ from, to });
      if (value === tiles[neighbor]) {
        movements.push({ from: neighbor, to });
        mergedAt.push(to);
        moved[to] = value * 2;
        addedScore += value * 2;
        offset++;
      } else {
        moved[to] = value;
      }
      destination++;
    }
  }

  const changed = moved.some((tile, index) => tile !== tiles[index]);
  return {
    tiles: changed ? moved : tiles, addedScore, movements, mergedAt,
  };
};

export const slideTiles = (tiles: readonly number[], direction: Direction) => {
  const { tiles: moved, addedScore } = traceSlide(tiles, direction);
  return { tiles: moved, addedScore };
};

const addTile = (tiles: readonly number[], random: () => number) => {
  const empty: number[] = [];
  tiles.forEach((tile, index) => {
    if (tile === 0) empty.push(index);
  });
  if (empty.length === 0) return { tiles, spawnedAt: null };

  const updated = [...tiles];
  const index = empty[Math.floor(random() * empty.length)];
  updated[index] = random() < 0.9 ? 2 : 4;
  return { tiles: updated, spawnedAt: index };
};

export const createGame = (random = Math.random): GameState => {
  const empty = Array<number>(BOARD_SIZE ** 2).fill(0);
  const { tiles } = addTile(addTile(empty, random).tiles, random);
  return {
    tiles, score: 0, previous: null, undoAvailable: true,
  };
};

export const planMove = (game: GameState, direction: Direction, random = Math.random): MovePlan | null => {
  const moved = traceSlide(game.tiles, direction);
  if (moved.tiles === game.tiles) return null;

  const { tiles, spawnedAt } = addTile(moved.tiles, random);
  return {
    game: {
      tiles,
      score: game.score + moved.addedScore,
      previous: game.undoAvailable ? { tiles: game.tiles, score: game.score } : null,
      undoAvailable: game.undoAvailable,
    },
    movements: moved.movements,
    mergedAt: moved.mergedAt,
    spawnedAt,
  };
};

export const playMove = (game: GameState, direction: Direction, random = Math.random): GameState => (
  planMove(game, direction, random)?.game ?? game
);

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
