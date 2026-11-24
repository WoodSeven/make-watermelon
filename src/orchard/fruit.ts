export const fruits = [
  {
    name: '蓝莓', radius: 12, light: '#a5b6f6', dark: '#46559c',
  },
  {
    name: '青梅', radius: 17, light: '#d0e39a', dark: '#689c51',
  },
  {
    name: '蜜橘', radius: 23, light: '#ffca75', dark: '#e78426',
  },
  {
    name: '红苹果', radius: 30, light: '#ff9a83', dark: '#cc4d48',
  },
  {
    name: '香梨', radius: 39, light: '#fff1a5', dark: '#c6a04f',
  },
  {
    name: '网纹甜瓜', radius: 50, light: '#e4db8d', dark: '#a4a655',
  },
  {
    name: '西瓜', radius: 63, light: '#86c97e', dark: '#338353',
  },
];

const drawLeaf = (context: CanvasRenderingContext2D) => {
  context.strokeStyle = '#694e37';
  context.lineWidth = 0.09;
  context.lineCap = 'round';
  context.beginPath();
  context.moveTo(0, -0.54);
  context.quadraticCurveTo(0.03, -0.75, -0.08, -0.87);
  context.stroke();
  context.fillStyle = '#3a744b';
  context.beginPath();
  context.moveTo(0.02, -0.69);
  context.quadraticCurveTo(0.17, -0.98, 0.49, -0.83);
  context.quadraticCurveTo(0.34, -0.56, 0.02, -0.69);
  context.fill();
};

const drawWatermelonStripes = (context: CanvasRenderingContext2D) => {
  context.strokeStyle = '#225c42';
  context.lineWidth = 0.16;
  [-0.72, -0.24, 0.24, 0.72].forEach((offset) => {
    context.beginPath();
    context.moveTo(offset * 0.55, -1);
    context.bezierCurveTo(offset - 0.22, -0.53, offset + 0.35, -0.25, offset + 0.08, 0.06);
    context.bezierCurveTo(offset - 0.24, 0.39, offset + 0.18, 0.63, offset * 0.7, 1);
    context.stroke();
  });
};

const drawMelonNet = (context: CanvasRenderingContext2D) => {
  context.strokeStyle = 'rgba(255, 248, 190, 0.75)';
  context.lineWidth = 0.035;
  for (let offset = -1.4; offset <= 1.4; offset += 0.26) {
    context.beginPath();
    context.moveTo(offset - 0.38, -1);
    context.bezierCurveTo(offset + 0.34, -0.48, offset - 0.19, 0.49, offset + 0.38, 1);
    context.moveTo(-1, offset - 0.24);
    context.bezierCurveTo(-0.55, offset + 0.24, 0.46, offset - 0.24, 1, offset + 0.24);
    context.stroke();
  }
};

export const drawFruit = (
  context: CanvasRenderingContext2D,
  level: number,
  x: number,
  y: number,
  radius = fruits[level].radius,
  angle = 0,
) => {
  const fruit = fruits[level];
  context.save();
  context.translate(x, y);
  context.rotate(angle);
  context.scale(radius, radius);

  const peel = context.createRadialGradient(-0.35, -0.45, 0.03, 0.1, 0.15, 1.02);
  peel.addColorStop(0, fruit.light);
  peel.addColorStop(1, fruit.dark);
  context.fillStyle = peel;
  context.strokeStyle = 'rgba(39, 63, 46, 0.24)';
  context.lineWidth = 0.06;
  context.beginPath();
  context.arc(0, 0, 0.96, 0, Math.PI * 2);
  context.fill();
  context.stroke();
  context.clip();

  if (level === 6) drawWatermelonStripes(context);
  else if (level === 5) drawMelonNet(context);
  else if (level === 0) {
    context.fillStyle = '#4d539c';
    context.beginPath();
    for (let point = 0; point < 10; point++) {
      const theta = point * Math.PI / 5;
      const size = point % 2 === 0 ? 0.32 : 0.12;
      context.lineTo(Math.cos(theta) * size, Math.sin(theta) * size - 0.55);
    }
    context.closePath();
    context.fill();
  } else {
    drawLeaf(context);
  }

  context.fillStyle = 'rgba(255, 255, 255, 0.42)';
  context.beginPath();
  context.ellipse(-0.35, -0.27, 0.19, 0.10, -0.56, 0, Math.PI * 2);
  context.fill();
  context.restore();
};
