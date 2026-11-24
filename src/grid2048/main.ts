import {
  BOARD_SIZE, TARGET, createGame, hasMove, planMove, undoMove,
} from './game';
import type { Direction, MovePlan } from './game';

const board = document.querySelector<HTMLElement>('#grid2048-board')!;
const score = document.querySelector<HTMLElement>('#grid2048-score')!;
const status = document.querySelector<HTMLElement>('#grid2048-status')!;
const restart = document.querySelector<HTMLButtonElement>('#grid2048-restart')!;
const undo = document.querySelector<HTMLButtonElement>('#grid2048-undo')!;
const directionButtons = document.querySelectorAll<HTMLButtonElement>('button[data-direction]');
const arrowKeys = new Map<string, Direction>([
  ['ArrowUp', 'up'],
  ['ArrowDown', 'down'],
  ['ArrowLeft', 'left'],
  ['ArrowRight', 'right'],
]);

const cells = Array.from({ length: BOARD_SIZE ** 2 }, () => {
  const cell = document.createElement('span');
  cell.className = 'grid2048-tile';
  cell.setAttribute('aria-hidden', 'true');
  return cell;
});
board.replaceChildren(...cells);

let game = createGame();
let input: AbortController | null = null;
let motion: AbortController | null = null;
const pendingMoves: Direction[] = [];
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

const focusBoard = () => board.focus({ preventScroll: true });

const updateUndo = () => {
  undo.disabled = !game.undoAvailable || game.previous === null;
};

const render = () => {
  for (let index = 0; index < cells.length; index++) {
    const cell = cells[index];
    const value = game.tiles[index];
    cell.dataset.value = String(value);
    cell.textContent = value === 0 ? '' : String(value);
  }

  score.textContent = String(game.score);
  updateUndo();

  const rows = Array.from({ length: BOARD_SIZE }, (_, row) => {
    const start = row * BOARD_SIZE;
    const values = game.tiles.slice(start, start + BOARD_SIZE).map((value) => (value === 0 ? '空' : value));
    return `第 ${row + 1} 行：${values.join('、')}`;
  });
  board.setAttribute('aria-label', `${BOARD_SIZE}×${BOARD_SIZE} 数字棋盘。${rows.join('。')}`);

  const reached = game.tiles.some((value) => value >= TARGET);
  const finished = !hasMove(game.tiles);
  let message = '';
  if (finished) {
    message = reached ? `已合成 ${TARGET}，本局结束。` : '没有可移动的方块，本局结束。';
  } else if (reached) {
    message = `已合成 ${TARGET}，可以继续合并。`;
  }
  if (status.textContent !== message) status.textContent = message;
};

const finishEffects = async (
  elements: readonly HTMLElement[],
  signal: AbortSignal,
  cleanup: () => void,
) => {
  const animations = elements.flatMap((element) => element.getAnimations());
  const clear = () => {
    animations.forEach((animation) => animation.cancel());
    cleanup();
  };

  signal.addEventListener('abort', clear, { once: true });
  await Promise.allSettled(animations.map((animation) => animation.finished));
  signal.removeEventListener('abort', clear);
  if (!signal.aborted) clear();
};

const animateMove = async (next: MovePlan, signal: AbortSignal) => {
  const bounds = board.getBoundingClientRect();
  const boardLeft = bounds.left + board.clientLeft;
  const boardTop = bounds.top + board.clientTop;
  const flights = next.movements.filter(({ from, to }) => from !== to).map(({ from, to }) => {
    const cell = cells[from];
    const start = cell.getBoundingClientRect();
    const end = cells[to].getBoundingClientRect();
    const ghost = cell.cloneNode(true) as HTMLSpanElement;
    ghost.classList.add('grid2048-tile--flight');
    ghost.style.left = `${start.left - boardLeft}px`;
    ghost.style.top = `${start.top - boardTop}px`;
    ghost.style.width = `${start.width}px`;
    ghost.style.height = `${start.height}px`;
    ghost.style.setProperty('--grid2048-dx', `${end.left - start.left}px`);
    ghost.style.setProperty('--grid2048-dy', `${end.top - start.top}px`);
    return { cell, ghost };
  });

  flights.forEach(({ cell }) => cell.classList.add('grid2048-tile--vacated'));
  const ghosts = flights.map(({ ghost }) => ghost);
  board.append(...ghosts);
  await finishEffects(ghosts, signal, () => {
    flights.forEach(({ cell, ghost }) => {
      cell.classList.remove('grid2048-tile--vacated');
      ghost.remove();
    });
  });

  if (signal.aborted) return;
  render();

  const arrivals = next.mergedAt.map((index) => ({ cell: cells[index], effect: 'grid2048-tile--merged' }));
  if (next.spawnedAt !== null) arrivals.push({ cell: cells[next.spawnedAt], effect: 'grid2048-tile--spawned' });
  arrivals.forEach(({ cell, effect }) => cell.classList.add(effect));
  await finishEffects(arrivals.map(({ cell }) => cell), signal, () => {
    arrivals.forEach(({ cell, effect }) => cell.classList.remove(effect));
  });
};

const runMoves = () => {
  if (motion) return;

  let next: MovePlan | null = null;
  while (!next && pendingMoves.length > 0) next = planMove(game, pendingMoves.shift()!);
  if (!next) return;

  game = next.game;
  if (reducedMotion.matches || !board.getAnimations) {
    render();
    runMoves();
    return;
  }

  const active = new AbortController();
  motion = active;
  updateUndo();
  animateMove(next, active.signal).then(() => {
    if (!active.signal.aborted) {
      motion = null;
      runMoves();
    }
  });
};

const move = (direction: Direction) => {
  if (pendingMoves.length === 3) return;
  pendingMoves.push(direction);
  runMoves();
};

const cancelMoves = () => {
  pendingMoves.length = 0;
  motion?.abort();
  motion = null;
};

const connect = () => {
  if (input) return;
  input = new AbortController();
  const options = { signal: input.signal };

  board.addEventListener('keydown', (event) => {
    const direction = arrowKeys.get(event.key);
    if (!direction || event.altKey || event.ctrlKey || event.metaKey) return;
    event.preventDefault();
    move(direction);
  }, options);

  directionButtons.forEach((button) => {
    const direction = button.dataset.direction as Direction;
    button.addEventListener('click', (event) => {
      move(direction);
      if (event.detail > 0) focusBoard();
    }, options);
  });

  restart.addEventListener('click', () => {
    cancelMoves();
    game = createGame();
    render();
    focusBoard();
  }, options);

  undo.addEventListener('click', () => {
    cancelMoves();
    game = undoMove(game);
    render();
    focusBoard();
  }, options);
};

window.addEventListener('pagehide', () => {
  input?.abort();
  input = null;
  cancelMoves();
  render();
});
window.addEventListener('pageshow', connect);
render();
connect();
focusBoard();
