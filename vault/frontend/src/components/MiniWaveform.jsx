import { useEffect, useRef, useCallback } from 'react';

export default function MiniWaveform({ active, currentTime = 0, duration = 1 }) {
  const canvasRef = useRef(null);

  const draw = useCallback(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    const w = c.width;
    const h = c.height;
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || '#09090b';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = active ? 'rgba(201, 168, 76, 0.45)' : 'rgba(255,255,255,0.12)';
    const mid = h / 2;
    ctx.beginPath();
    for (let x = 0; x < w; x++) {
      const n = Math.sin(x / 9 + (active ? Date.now() / 200 : 0)) * (h / 3);
      ctx.moveTo(x, mid + n);
      ctx.lineTo(x, mid - n * 0.4);
    }
    ctx.stroke();
    const dur = duration || 1;
    const ph = (currentTime / dur) * w;
    ctx.strokeStyle = 'var(--gold)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(ph, 0);
    ctx.lineTo(ph, h);
    ctx.stroke();
  }, [active, currentTime, duration]);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    c.width = 240;
    c.height = 36;
    draw();
  }, [draw]);

  useEffect(() => {
    if (!active) return;
    const id = requestAnimationFrame(function loop() {
      draw();
      requestAnimationFrame(loop);
    });
    return () => cancelAnimationFrame(id);
  }, [active, draw]);

  return <canvas ref={canvasRef} style={{ width: '100%', maxWidth: 240, borderRadius: 4, display: 'block' }} />;
}
