import {
  BOARD_SIZE, TARGET, createGame, hasMove, playMove, undoMove,
} from './game';
import type { Direction } from './game';

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

const focusBoard = () => board.focus({ preventScroll: true });

const render = () => {
  for (let index = 0; index < cells.length; index++) {
    const cell = cells[index];
    const value = game.tiles[index];
    cell.dataset.value = String(value);
    cell.textContent = value === 0 ? '' : String(value);
  }

  score.textContent = String(game.score);
  undo.disabled = !game.undoAvailable || game.previous === null;

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

const move = (direction: Direction) => {
  const next = playMove(game, direction);
  if (next === game) return;
  game = next;
  render();
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
    game = createGame();
    render();
    focusBoard();
  }, options);

  undo.addEventListener('click', () => {
    game = undoMove(game);
    render();
    focusBoard();
  }, options);
};

window.addEventListener('pagehide', () => {
  input?.abort();
  input = null;
});
window.addEventListener('pageshow', connect);
render();
connect();
focusBoard();
