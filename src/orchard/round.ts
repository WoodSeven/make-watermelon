import b2 from '../box2d';
import type { b2Body } from '../b2/dynamics/b2_body';
import { fruits } from './fruit';

export const WIDTH = 360;
export const HEIGHT = 460;
export const INSET = 10;
export const DROP_Y = 44;
export const DANGER_Y = 93;
export const STEP = 1 / 120;
export const RATIO = 30;

const DROP_INTERVAL = 0.28;
const ENTRY_GRACE = 0.72;
const OVERFLOW_LIMIT = 1.25;
const MAX_LEVEL = fruits.length - 1;

interface Piece {
  body: b2Body;
  level: number;
  createdAt: number;
}

export const clampDropX = (x: number, level: number) => {
  const edge = INSET + fruits[level].radius;
  return Math.min(WIDTH - edge, Math.max(edge, x));
};

export class OrchardRound {
  readonly pieces = new Map<b2Body, Piece>();

  score = 0;

  overflow = 0;

  private readonly world = new b2.World({ x: 0, y: 24 });

  private readonly mergePairs: [Piece, Piece][] = [];

  private readonly queued = new Set<Piece>();

  private time = 0;

  private nextDropAt = 0;

  constructor() {
    const wall = new b2.FixtureDef();
    wall.friction = 0.37;
    wall.restitution = 0.13;
    wall.shape = new b2.ChainShape().CreateLoop([
      { x: INSET / RATIO, y: INSET / RATIO },
      { x: INSET / RATIO, y: (HEIGHT - INSET) / RATIO },
      { x: (WIDTH - INSET) / RATIO, y: (HEIGHT - INSET) / RATIO },
      { x: (WIDTH - INSET) / RATIO, y: INSET / RATIO },
    ]);
    this.world.CreateBody().CreateFixture(wall);

    const listener = new b2.ContactListener();
    listener.PreSolve = (contact) => {
      if (!contact.IsTouching()) return;
      const first = this.pieces.get(contact.GetFixtureA().GetBody());
      const second = this.pieces.get(contact.GetFixtureB().GetBody());
      if (!first || !second || first.level !== second.level || first.level === MAX_LEVEL) return;
      if (this.queued.has(first) || this.queued.has(second)) return;
      this.queued.add(first);
      this.queued.add(second);
      this.mergePairs.push([first, second]);
      contact.SetEnabled(false);
    };
    this.world.SetContactListener(listener);
  }

  get over() {
    return this.overflow >= OVERFLOW_LIMIT;
  }

  get canDrop() {
    return !this.over && this.time >= this.nextDropAt;
  }

  drop(level: number, x: number) {
    if (!this.canDrop) return false;
    this.addPiece(level, x, DROP_Y);
    this.nextDropAt = this.time + DROP_INTERVAL;
    return true;
  }

  step() {
    this.world.Step(STEP, 8, 3);
    this.time += STEP;
    this.mergePieces();

    const aboveLine = [...this.pieces.values()].some(({ body, level, createdAt }) => (
      this.time - createdAt >= ENTRY_GRACE
      && body.GetPosition().y * RATIO - fruits[level].radius < DANGER_Y
    ));
    this.overflow = aboveLine ? this.overflow + STEP : 0;
  }

  private addPiece(level: number, x: number, y: number) {
    const { radius } = fruits[level];
    const bodyDef = new b2.BodyDef();
    bodyDef.type = b2.dynamicBody;
    bodyDef.position.Set(clampDropX(x, level) / RATIO, Math.min(HEIGHT - INSET - radius, Math.max(INSET + radius, y)) / RATIO);
    bodyDef.angularDamping = 0.5;

    const fixture = new b2.FixtureDef();
    fixture.shape = new b2.CircleShape(radius / RATIO);
    fixture.density = 1;
    fixture.friction = 0.44;
    fixture.restitution = 0.16;

    const body = this.world.CreateBody(bodyDef);
    body.CreateFixture(fixture);
    this.pieces.set(body, { body, level, createdAt: this.time });
    return body;
  }

  private mergePieces() {
    // The world is unlocked after Step, so both bodies may be replaced here.
    this.mergePairs.forEach(([first, second]) => {
      const a = first.body.GetPosition();
      const b = second.body.GetPosition();
      const centerX = (a.x + b.x) * RATIO / 2;
      const centerY = (a.y + b.y) * RATIO / 2;
      const nextLevel = first.level + 1;
      this.pieces.delete(first.body);
      this.pieces.delete(second.body);
      this.world.DestroyBody(first.body);
      this.world.DestroyBody(second.body);
      this.addPiece(nextLevel, centerX, centerY);
      this.score += 5 * (2 ** nextLevel);
    });
    this.mergePairs.length = 0;
    this.queued.clear();
  }
}
