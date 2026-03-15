import { useState } from 'react';

interface ImageViewerProps {
  src: string;
  alt: string;
}

export default function ImageViewer({ src, alt }: ImageViewerProps) {
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="rounded border border-border-primary px-2 py-1 text-xs"
          onClick={() => setScale((prev) => Math.min(5, prev * 1.2))}
        >
          拡大
        </button>
        <button
          type="button"
          className="rounded border border-border-primary px-2 py-1 text-xs"
          onClick={() => setScale((prev) => Math.max(0.5, prev * 0.8))}
        >
          縮小
        </button>
        <button
          type="button"
          className="rounded border border-border-primary px-2 py-1 text-xs"
          onClick={() => {
            setScale(1);
            setPosition({ x: 0, y: 0 });
          }}
        >
          リセット
        </button>
      </div>
      <div
        className="max-h-[70vh] overflow-hidden rounded border border-border-primary"
        onWheel={(e) => {
          e.preventDefault();
          const delta = e.deltaY > 0 ? 0.9 : 1.1;
          setScale((prev) => Math.max(0.5, Math.min(5, prev * delta)));
        }}
        onMouseDown={(e) => {
          if (scale <= 1) return;
          setDragging(true);
          setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
        }}
        onMouseMove={(e) => {
          if (!dragging) return;
          setPosition({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
        }}
        onMouseUp={() => setDragging(false)}
        onMouseLeave={() => setDragging(false)}
        onDoubleClick={() => {
          setScale(1);
          setPosition({ x: 0, y: 0 });
        }}
        style={{ cursor: scale > 1 ? 'grab' : 'default' }}
      >
        <img
          src={src}
          alt={alt}
          className="w-full object-contain"
          style={{
            transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
            transformOrigin: 'center center',
          }}
        />
      </div>
    </div>
  );
}
