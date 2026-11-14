import { useEffect, useRef, useState } from "react";

interface MotherboardArtworkProps {
  src: string;
  alt: string;
  rescanToken: number;
  motionEnabled: boolean;
}

/** Canvas compositing works for packaged file:// images without a CSS URL mask. */
export function MotherboardArtwork({ src, alt, rescanToken, motionEnabled }: MotherboardArtworkProps) {
  const imageRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null);

  useEffect(() => {
    const image = imageRef.current;
    const canvas = canvasRef.current;
    if (!image || !canvas || !motionEnabled || loadedSrc !== src || !image.naturalWidth) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    let frame = 0;
    let started: number | undefined;
    // Keep the one-shot inexpensive even when the source image is very large.
    const size = Math.min(768, image.naturalWidth);
    canvas.width = size;
    canvas.height = Math.round(size * image.naturalHeight / image.naturalWidth);
    const { width, height } = canvas;
    const duration = 1500;
    const draw = (time: number) => {
      started ??= time;
      const elapsed = time - started;
      if (elapsed >= duration) {
        context.clearRect(0, 0, width, height);
        canvas.style.opacity = "0";
        canvas.dataset.sweepState = "complete";
        return;
      }
      const progress = elapsed / duration;
      const position = -.2 + progress * 1.4;
      const band = width * .15;
      context.clearRect(0, 0, width, height);
      context.globalCompositeOperation = "source-over";
      context.drawImage(image, 0, 0, width, height);
      context.globalCompositeOperation = "source-in";
      const gradient = context.createLinearGradient(
        position * width - band, position * height - band,
        position * width + band, position * height + band,
      );
      gradient.addColorStop(0, "rgba(247,250,253,0)");
      gradient.addColorStop(.3, "rgba(247,250,253,.16)");
      gradient.addColorStop(.5, "rgba(255,255,255,.68)");
      gradient.addColorStop(.7, "rgba(247,250,253,.16)");
      gradient.addColorStop(1, "rgba(247,250,253,0)");
      context.fillStyle = gradient;
      context.fillRect(0, 0, width, height);
      canvas.style.opacity = String(Math.min(1, progress * 10, (1 - progress) * 10));
      canvas.dataset.sweepState = "running";
      frame = requestAnimationFrame(draw);
    };
    // Entry waits until the deliberate page reveal has finished; Rescan is immediate.
    canvas.dataset.sweepState = "pending";
    const timer = window.setTimeout(() => { frame = requestAnimationFrame(draw); }, rescanToken === 0 ? 780 : 0);
    return () => {
      clearTimeout(timer);
      cancelAnimationFrame(frame);
      context.clearRect(0, 0, width, height);
      canvas.style.opacity = "0";
      canvas.dataset.sweepState = "idle";
    };
  }, [loadedSrc, src, rescanToken, motionEnabled]);

  return <>
    <img ref={imageRef} src={src} alt={alt} fetchPriority="high" decoding="async"
      draggable={false} onLoad={() => setLoadedSrc(src)}
      onDragStart={event => event.preventDefault()} />
    <canvas ref={canvasRef} className="di-board-sun-sweep" aria-hidden="true"
      data-testid="motherboard-light-sweep" data-sweep-id={rescanToken}
      data-sweep-duration="1500" />
  </>;
}
