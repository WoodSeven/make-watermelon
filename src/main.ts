import pixi from './pixi';
import { Fruits, Height, Width } from './config';
import app from './app';
import { init } from './core';

const { Loader } = pixi;
const images = Fruits.map((i) => i.name);
const root = document.getElementById('root')!;
const canvas = app.view;
root.appendChild(canvas);
Loader.shared.add(images).load(init);

const resizeObserver = new ResizeObserver(([entry]) => {
  const { width, height } = entry.contentRect;
  const scale = Math.min(width / Width, height / Height);
  canvas.style.width = `${Width * scale}px`;
  canvas.style.height = `${Height * scale}px`;
});
resizeObserver.observe(root.parentElement!);
