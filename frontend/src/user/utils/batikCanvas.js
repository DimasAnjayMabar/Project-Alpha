import { resolveVisualTheme } from './helpers';

export function drawProductMotifToCanvas(canvas, product, size = 512) {
  if (!canvas || !product) return;
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const motifHint = `${product.name || ''} ${product.additional_attribute?.motif || ''}`.trim();
  const theme = resolveVisualTheme(motifHint, product.shop_id);
  const bg = theme.warna_utama;
  const secondary = theme.warna_sekunder;
  const accent = theme.warna_aksen;
  const patternType = theme.pola_jenis;

  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, size, size);

  ctx.strokeStyle = secondary;
  ctx.globalAlpha = 0.08;
  ctx.lineWidth = Math.max(1, size * 0.0018);
  for (let i = 0; i < 40; i++) {
    const sx = ((i * 73) % 100) * 0.01 * size;
    const sy = ((i * 137) % 100) * 0.01 * size;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx + size * 0.08, sy + ((i % 3) - 1) * size * 0.05);
    ctx.lineTo(sx + size * 0.14, sy + ((i % 2) * 2 - 1) * size * 0.07);
    ctx.stroke();
  }

  const gridStep = size / 16;
  ctx.fillStyle = secondary;
  ctx.globalAlpha = 0.24;
  for (let y = 0; y < size; y += gridStep / 2) {
    for (let x = 0; x < size; x += gridStep / 2) {
      ctx.beginPath();
      ctx.arc(x + ((y / (gridStep / 2)) % 2) * (gridStep / 4), y, size * 0.003, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;

  const cells = 4;
  const cellSize = size / cells;

  for (let row = -1; row <= cells; row++) {
    for (let col = -1; col <= cells; col++) {
      const offsetX = (row % 2) * (cellSize * 0.5);
      const cx = col * cellSize + cellSize * 0.5 + offsetX;
      const cy = row * cellSize + cellSize * 0.5;
      const r = cellSize * 0.35;

      ctx.save();
      ctx.translate(cx, cy);

      if (patternType === 'cengkeh') {
        ctx.strokeStyle = secondary;
        ctx.lineWidth = size * 0.0045;
        ctx.beginPath();
        ctx.arc(0, 0, r * 1.12, 0, Math.PI * 2);
        ctx.stroke();

        for (let k = 0; k < 4; k++) {
          ctx.save();
          ctx.rotate((k * Math.PI) / 2 + Math.PI / 4);
          ctx.fillStyle = secondary;
          ctx.beginPath();
          ctx.ellipse(0, -r * 0.5, r * 0.23, r * 0.46, 0, 0, Math.PI * 2);
          ctx.fill();

          ctx.strokeStyle = accent;
          ctx.lineWidth = size * 0.004;
          ctx.stroke();

          ctx.beginPath();
          ctx.moveTo(0, -r * 0.2);
          ctx.lineTo(0, -r * 0.7);
          ctx.stroke();

          ctx.fillStyle = accent;
          ctx.beginPath();
          ctx.arc(0, -r * 0.86, r * 0.085, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
        ctx.fillStyle = accent;
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.16, 0, Math.PI * 2);
        ctx.fill();
      } else if (patternType === 'manggis') {
        ctx.fillStyle = secondary;
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.88, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = accent;
        ctx.lineWidth = size * 0.0045;
        ctx.stroke();

        for (let j = 0; j < 6; j++) {
          ctx.save();
          ctx.rotate((j * Math.PI) / 3);
          ctx.fillStyle = accent;
          ctx.beginPath();
          ctx.ellipse(0, -r * 0.38, r * 0.16, r * 0.3, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      } else if (patternType === 'turonggo') {
        ctx.strokeStyle = accent;
        ctx.lineWidth = size * 0.006;
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.86, 0.25, Math.PI * 1.75);
        ctx.stroke();

        ctx.fillStyle = secondary;
        ctx.beginPath();
        ctx.moveTo(-r * 0.5, r * 0.32);
        ctx.quadraticCurveTo(-r * 0.1, -r * 0.9, r * 0.55, -r * 0.25);
        ctx.quadraticCurveTo(r * 0.25, r * 0.15, -r * 0.1, r * 0.1);
        ctx.quadraticCurveTo(-r * 0.25, r * 0.45, -r * 0.5, r * 0.32);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = accent;
        ctx.beginPath();
        ctx.arc(r * 0.2, -r * 0.22, r * 0.08, 0, Math.PI * 2);
        ctx.fill();
      } else if (patternType === 'gajah_nungguk') {
        ctx.strokeStyle = secondary;
        ctx.lineWidth = size * 0.0055;
        ctx.strokeRect(-r * 0.78, -r * 0.78, r * 1.56, r * 1.56);

        ctx.fillStyle = secondary;
        ctx.beginPath();
        ctx.arc(-r * 0.08, 0, r * 0.48, Math.PI * 0.9, Math.PI * 2.1);
        ctx.lineTo(r * 0.55, r * 0.35);
        ctx.quadraticCurveTo(r * 0.65, r * 0.55, r * 0.42, r * 0.52);
        ctx.lineTo(r * 0.28, r * 0.28);
        ctx.lineTo(-r * 0.42, r * 0.35);
        ctx.closePath();
        ctx.fill();

        ctx.strokeStyle = accent;
        ctx.lineWidth = size * 0.0045;
        ctx.stroke();
      } else if (patternType === 'pari_srono') {
        ctx.strokeStyle = accent;
        ctx.lineWidth = size * 0.0055;
        ctx.beginPath();
        ctx.moveTo(-r * 0.45, r * 0.65);
        ctx.quadraticCurveTo(-r * 0.2, -r * 0.35, r * 0.55, -r * 0.55);
        ctx.stroke();

        for (let b = 0; b < 5; b++) {
          const t = b / 4;
          const bx = -r * 0.25 + t * r * 0.72;
          const by = r * 0.25 - t * r * 0.75;
          ctx.fillStyle = b % 2 === 0 ? secondary : accent;
          ctx.beginPath();
          ctx.ellipse(bx - r * 0.14, by - r * 0.08, r * 0.16, r * 0.08, -0.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.beginPath();
          ctx.ellipse(bx + r * 0.14, by + r * 0.1, r * 0.16, r * 0.08, 0.35, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (patternType === 'batu_tumpuk') {
        const stones = [
          { x: 0, y: r * 0.36, rx: r * 0.68, ry: r * 0.26 },
          { x: -r * 0.06, y: -r * 0.04, rx: r * 0.5, ry: r * 0.22 },
          { x: r * 0.05, y: -r * 0.38, rx: r * 0.34, ry: r * 0.17 },
        ];
        stones.forEach((st, idx) => {
          ctx.fillStyle = idx % 2 === 0 ? secondary : bg;
          ctx.beginPath();
          ctx.ellipse(st.x, st.y, st.rx, st.ry, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = accent;
          ctx.lineWidth = size * 0.005;
          ctx.stroke();
        });
      } else {
        ctx.save();
        ctx.rotate(-0.4);
        ctx.fillStyle = secondary;
        ctx.beginPath();
        ctx.ellipse(0, 0, r * 0.42, r * 0.62, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = accent;
        ctx.lineWidth = size * 0.0055;
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(0, -r * 0.52);
        ctx.bezierCurveTo(r * 0.16, -r * 0.18, -r * 0.16, r * 0.18, 0, r * 0.52);
        ctx.stroke();
        ctx.restore();
      }

      ctx.restore();
    }
  }
}