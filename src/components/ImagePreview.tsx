import { useState, useRef, useCallback, useEffect } from "react";

interface ImagePreviewProps {
  src: string;
  name: string;
}

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 20;
const ZOOM_STEP = 1.15;

export function ImagePreview({ src, name }: ImagePreviewProps) {
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [fitted, setFitted] = useState(true);
  const [imgSize, setImgSize] = useState({ w: 0, h: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef<{ startX: number; startY: number; ox: number; oy: number } | null>(null);

  // Fit image to container
  const fitToView = useCallback(() => {
    if (!containerRef.current || !imgSize.w) return;
    const rect = containerRef.current.getBoundingClientRect();
    const scaleX = (rect.width - 32) / imgSize.w;
    const scaleY = (rect.height - 32) / imgSize.h;
    const scale = Math.min(scaleX, scaleY, 1);
    setZoom(scale);
    setOffset({ x: 0, y: 0 });
    setFitted(true);
  }, [imgSize]);

  // Re-fit when image or container changes
  useEffect(() => {
    if (fitted) fitToView();
  }, [imgSize, fitted, fitToView]);

  const onImgLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    setImgSize({ w: img.naturalWidth, h: img.naturalHeight });
  }, []);

  // Zoom with scroll wheel centered on cursor
  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const cursorX = e.clientX - rect.left - rect.width / 2;
    const cursorY = e.clientY - rect.top - rect.height / 2;

    const factor = e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;

    setZoom((prev) => {
      const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, prev * factor));
      const ratio = next / prev;
      setOffset((o) => ({
        x: cursorX - ratio * (cursorX - o.x),
        y: cursorY - ratio * (cursorY - o.y),
      }));
      return next;
    });
    setFitted(false);
  }, []);

  // Pan with mouse drag
  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    dragging.current = { startX: e.clientX, startY: e.clientY, ox: offset.x, oy: offset.y };

    const onMove = (ev: MouseEvent) => {
      if (!dragging.current) return;
      setOffset({
        x: dragging.current.ox + (ev.clientX - dragging.current.startX),
        y: dragging.current.oy + (ev.clientY - dragging.current.startY),
      });
      setFitted(false);
    };
    const onUp = () => {
      dragging.current = null;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, [offset]);

  const zoomIn = () => {
    setZoom((z) => Math.min(MAX_ZOOM, z * ZOOM_STEP));
    setFitted(false);
  };
  const zoomOut = () => {
    setZoom((z) => Math.max(MIN_ZOOM, z / ZOOM_STEP));
    setFitted(false);
  };
  const zoomActual = () => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
    setFitted(false);
  };
  const zoomFit = () => {
    fitToView();
  };

  const pct = Math.round(zoom * 100);

  return (
    <div className="image-preview">
      <div
        className="image-preview-canvas"
        ref={containerRef}
        onWheel={onWheel}
        onMouseDown={onMouseDown}
      >
        <img
          src={src}
          alt={name}
          onLoad={onImgLoad}
          draggable={false}
          style={{
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`,
            transformOrigin: "center center",
          }}
        />
      </div>
      <div className="image-preview-toolbar">
        <button className="image-preview-btn" onClick={zoomOut} title="Zoom out">&minus;</button>
        <span className="image-preview-zoom">{pct}%</span>
        <button className="image-preview-btn" onClick={zoomIn} title="Zoom in">+</button>
        <button className="image-preview-btn" onClick={zoomActual} title="Actual size">1:1</button>
        <button className="image-preview-btn" onClick={zoomFit} title="Fit to view">Fit</button>
        {imgSize.w > 0 && (
          <span className="image-preview-info">{imgSize.w} &times; {imgSize.h}</span>
        )}
      </div>
    </div>
  );
}
