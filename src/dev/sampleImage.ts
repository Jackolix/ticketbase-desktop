/**
 * A screenshot-sized PNG, drawn at runtime for the preview harness.
 *
 * Deliberately larger than the preview pane: the zoom, pan and rotate controls
 * only do anything once an image outgrows the space it is shown in, so a small
 * checked-in icon would leave all of that untested.
 *
 * Development only; nothing imports it from a production path.
 */

const WIDTH = 1400;
const HEIGHT = 900;

export async function makeSampleScreenshot(): Promise<Uint8Array> {
  const canvas = new OffscreenCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no 2d context for the sample screenshot');

  ctx.fillStyle = '#f4f4f5';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // A grid, so panning and zooming are visibly doing something and it is
  // obvious which part of the image is on screen.
  ctx.strokeStyle = '#d4d4d8';
  ctx.lineWidth = 1;
  for (let x = 0; x <= WIDTH; x += 100) {
    ctx.beginPath();
    ctx.moveTo(x + 0.5, 0);
    ctx.lineTo(x + 0.5, HEIGHT);
    ctx.stroke();
  }
  for (let y = 0; y <= HEIGHT; y += 100) {
    ctx.beginPath();
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(WIDTH, y + 0.5);
    ctx.stroke();
  }

  ctx.fillStyle = '#71717a';
  ctx.font = '16px monospace';
  for (let x = 0; x < WIDTH; x += 100) {
    for (let y = 0; y < HEIGHT; y += 100) {
      ctx.fillText(`${x},${y}`, x + 8, y + 24);
    }
  }

  // Corner markers, so it is clear at a glance when an edge has been scrolled
  // out of reach.
  ctx.fillStyle = '#dc2626';
  for (const [x, y] of [
    [0, 0],
    [WIDTH - 60, 0],
    [0, HEIGHT - 60],
    [WIDTH - 60, HEIGHT - 60],
  ]) {
    ctx.fillRect(x, y, 60, 60);
  }

  ctx.fillStyle = '#18181b';
  ctx.font = 'bold 48px sans-serif';
  ctx.fillText('Screenshot 1400 × 900', 120, 480);

  const blob = await canvas.convertToBlob({ type: 'image/png' });
  return new Uint8Array(await blob.arrayBuffer());
}
