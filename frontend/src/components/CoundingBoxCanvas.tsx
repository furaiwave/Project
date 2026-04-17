import React, { useEffect, useRef, useCallback } from 'react';
import type { DetectedObject } from '../types/detection';

// ready: true  → objects гарантовано присутні, canvas малює
// ready: false → зображення є, але inference ще не завершено
type BoundingBoxCanvasProps =
  | { readonly src: string; readonly ready: true;  readonly objects: readonly DetectedObject[] }
  | { readonly src: string; readonly ready: false; readonly objects?: never };

// Використовуємо hsl щоб кольори добре виглядали і на світлій, і на темній темі
const PALETTE = [
  '#ef4444', '#f97316', '#eab308', '#22c55e',
  '#14b8a6', '#3b82f6', '#8b5cf6', '#ec4899',
] as const;

type PaletteColor = (typeof PALETTE)[number];

// Детермінований вибір кольору з palette за рядком label
const pickColor = (label: string): PaletteColor => {
  let h = 0;
  for (let i = 0; i < label.length; i++) h = (h * 31 + label.charCodeAt(i)) | 0;
  return PALETTE[Math.abs(h) % PALETTE.length];
};

//  Малювання одного bounding box
const drawDetection = (
  ctx:    CanvasRenderingContext2D,
  obj:    DetectedObject,
  scaleX: number,
  scaleY: number,
): void => {
  const [cx, cy, w, h] = obj.bbox;

  // YOLOv8 віддає center x/y — конвертуємо в top-left
  const x = (cx - w / 2) * scaleX;
  const y = (cy - h / 2) * scaleY;
  const sw = w * scaleX;
  const sh = h * scaleY;

  const color = pickColor(obj.label);
  const pct   = Math.round(obj.confidence * 100);

  // Рамка
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth   = 2;
  ctx.strokeRect(x, y, sw, sh);

  // Label pill 
  const text = `${obj.label}  ${pct}%`;
  ctx.font = '600 12px ui-sans-serif, system-ui, sans-serif';

  const textW  = ctx.measureText(text).width;
  const pillH  = 20;
  const pillW  = textW + 12;
  const pillX  = x;
  // Якщо рамка у верхньому краю — pill іде всередину, інакше над рамкою
  const pillY  = y > pillH ? y - pillH : y;

  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(pillX, pillY, pillW, pillH, 3);
  ctx.fill();

  ctx.fillStyle = '#ffffff';
  ctx.fillText(text, pillX + 6, pillY + 14);
  ctx.restore();
};

// Component 
export const BoundingBoxCanvas: React.FC<BoundingBoxCanvasProps> = ({
  src,
  ready,
  objects,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef    = useRef<HTMLImageElement>(null);

  const redraw = useCallback((): void => {
    const canvas = canvasRef.current;
    const img    = imgRef.current;
    if (!canvas || !img || !ready || !objects) return;

    // Canvas розміром = натуральний розмір зображення (для точного scaling)
    canvas.width  = img.naturalWidth;
    canvas.height = img.naturalHeight;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Scale: bbox у пікселях оригінального зображення → розмір canvas
    const scaleX = canvas.width  / img.naturalWidth;
    const scaleY = canvas.height / img.naturalHeight;

    objects.forEach((obj) => drawDetection(ctx, obj, scaleX, scaleY));
  }, [ready, objects]);

  // Перемальовуємо коли змінюються objects або зображення завантажилось
  useEffect(() => { redraw(); }, [redraw]);

  return (
    // position: relative → canvas накладається поверх img через absolute inset-0
    <div className="relative w-full">
      <img
        ref={imgRef}
        src={src}
        alt="Detection input"
        onLoad={redraw}
        className="block w-full rounded-md"
        // Drag-and-drop не ламатиме drop zone
        draggable={false}
      />
      <canvas
        ref={canvasRef}
        // pointer-events: none → кліки проходять крізь canvas до img
        className="absolute inset-0 h-full w-full pointer-events-none"
      />
    </div>
  );
};