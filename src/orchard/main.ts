import { drawFruit, fruits } from './fruit';
import {
  clampDropX, DANGER_Y, DROP_Y, HEIGHT, INSET, OrchardRound, RATIO, STEP, WIDTH,
} from './round';

const board = document.querySelector<HTMLCanvasElement>('#orchard-board')!;
const nextBoard = document.querySelector<HTMLCanvasElement>('#orchard-next')!;
const score = document.querySelector<HTMLElement>('#orchard-score')!;
const restart = document.querySelector<HTMLButtonElement>('#orchard-restart')!;
const result = document.querySelector<HTMLElement>('#orchard-result')!;
const resultText = document.querySelector<HTMLElement>('#orchard-result-text')!;
const playAgain = document.querySelector<HTMLButtonElement>('#orchard-play-again')!;
const context = board.getContext('2d')!;
const nextContext = nextBoard.getContext('2d')!;

const pickFruit = () => {
  const roll = Math.random();
  if (roll < 0.48) return 0;
  if (roll < 0.8) return 1;
  return 2;
};

let round = new OrchardRound();
let currentFruit = pickFruit();
let nextFruit = pickFruit();
let aimX = WIDTH / 2;
let pointer: number | null = null;
let listeners: AbortController | null = null;
let frame: number | null = null;
let lastFrame: number | null = null;
let pendingTime = 0;

const drawNextFruit = () => {
  const { width, height } = nextBoard;
  nextContext.clearRect(0, 0, width, height);
  drawFruit(nextContext, nextFruit, width / 2, height / 2, Math.min(width, height) * 0.42);
  nextBoard.setAttribute('aria-label', `下一颗：${fruits[nextFruit].name}`);
};

const drawBoard = () => {
  const overflow = round.overflow > 0;
  context.clearRect(0, 0, WIDTH, HEIGHT);
  context.fillStyle = '#deebd3';
  context.fillRect(0, 0, WIDTH, HEIGHT);
  context.fillStyle = '#f8faef';
  context.fillRect(INSET, INSET, WIDTH - 2 * INSET, HEIGHT - 2 * INSET);
  context.fillStyle = overflow ? '#f8ded4' : '#edf3e4';
  context.fillRect(INSET, INSET, WIDTH - 2 * INSET, DANGER_Y - INSET);

  context.save();
  context.strokeStyle = overflow ? '#c45443' : '#ab6b4b';
  context.setLineDash([5, 6]);
  context.beginPath();
  context.moveTo(INSET, DANGER_Y + 0.5);
  context.lineTo(WIDTH - INSET, DANGER_Y + 0.5);
  context.stroke();
  context.restore();

  if (!round.over) {
    const x = clampDropX(aimX, currentFruit);
    context.save();
    context.globalAlpha = round.canDrop ? 1 : 0.45;
    context.strokeStyle = '#7c9976';
    context.setLineDash([2, 6]);
    context.beginPath();
    context.moveTo(x + 0.5, DROP_Y);
    context.lineTo(x + 0.5, HEIGHT - INSET);
    context.stroke();
    drawFruit(context, currentFruit, x, DROP_Y);
    context.restore();
  }

  round.pieces.forEach(({ body, level }) => {
    const { x, y } = body.GetPosition();
    drawFruit(context, level, x * RATIO, y * RATIO, fruits[level].radius, body.GetAngle());
  });
};

const animate = (now: number) => {
  frame = null;
  if (lastFrame !== null) pendingTime += Math.min((now - lastFrame) / 1000, 0.05);
  lastFrame = now;

  const previousScore = round.score;
  while (pendingTime >= STEP && !round.over) {
    round.step();
    pendingTime -= STEP;
  }
  if (round.score !== previousScore) score.textContent = String(round.score);
  drawBoard();

  if (round.over) {
    resultText.textContent = `水果堆过了警戒线，本局得分 ${round.score}。`;
    result.hidden = false;
    playAgain.focus({ preventScroll: true });
    return;
  }
  frame = requestAnimationFrame(animate);
};

const startAnimation = () => {
  if (frame === null && !round.over && round.pieces.size > 0) {
    lastFrame = null;
    frame = requestAnimationFrame(animate);
  }
};

const stopAnimation = () => {
  if (frame !== null) cancelAnimationFrame(frame);
  frame = null;
  lastFrame = null;
  pendingTime = 0;
};

const aimAt = (x: number) => {
  aimX = clampDropX(x, currentFruit);
  if (frame === null) drawBoard();
};

const aimAtPointer = (clientX: number) => {
  const bounds = board.getBoundingClientRect();
  if (bounds.width > 0) aimAt((clientX - bounds.left) * WIDTH / bounds.width);
};

const releasePointer = () => {
  const activePointer = pointer;
  pointer = null;
  if (activePointer !== null && board.hasPointerCapture(activePointer)) {
    board.releasePointerCapture(activePointer);
  }
};

const dropFruit = () => {
  if (!round.drop(currentFruit, aimX)) return;
  currentFruit = nextFruit;
  nextFruit = pickFruit();
  aimX = clampDropX(aimX, currentFruit);
  drawNextFruit();
  drawBoard();
  startAnimation();
};

const reset = () => {
  releasePointer();
  stopAnimation();
  round = new OrchardRound();
  currentFruit = pickFruit();
  nextFruit = pickFruit();
  aimX = WIDTH / 2;
  score.textContent = '0';
  result.hidden = true;
  resultText.textContent = '';
  drawNextFruit();
  drawBoard();
  board.focus({ preventScroll: true });
};

const connect = () => {
  if (listeners !== null) return;
  listeners = new AbortController();
  const options = { signal: listeners.signal };

  board.addEventListener('pointerdown', (event) => {
    if (round.over || pointer !== null || !event.isPrimary || event.button !== 0) return;
    pointer = event.pointerId;
    board.setPointerCapture(pointer);
    board.focus({ preventScroll: true });
    aimAtPointer(event.clientX);
  }, options);
  board.addEventListener('pointermove', (event) => {
    if (round.over) return;
    const aiming = pointer === event.pointerId || (pointer === null && event.pointerType === 'mouse');
    if (aiming) aimAtPointer(event.clientX);
  }, options);
  board.addEventListener('pointerup', (event) => {
    if (event.pointerId !== pointer) return;
    aimAtPointer(event.clientX);
    releasePointer();
    dropFruit();
  }, options);
  board.addEventListener('pointercancel', (event) => {
    if (event.pointerId === pointer) releasePointer();
  }, options);
  board.addEventListener('lostpointercapture', (event) => {
    if (event.pointerId === pointer) pointer = null;
  }, options);
  board.addEventListener('keydown', (event) => {
    if (round.over) return;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      aimAt(aimX + (event.key === 'ArrowLeft' ? -12 : 12));
    } else if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault();
      if (!event.repeat) dropFruit();
    }
  }, options);
  restart.addEventListener('click', reset, options);
  playAgain.addEventListener('click', reset, options);
  startAnimation();
};

const disconnect = () => {
  listeners?.abort();
  listeners = null;
  releasePointer();
  stopAnimation();
};

window.addEventListener('pageshow', connect);
window.addEventListener('pagehide', disconnect);
drawNextFruit();
drawBoard();
connect();
