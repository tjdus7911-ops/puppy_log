// SNS 공유용 이미지 생성(1080×1350). 정확한 주소·GPS 경로는 넣지 않고 시·군 단위 지역만 표시합니다.
export interface ShareInput {
  title: string;
  petPhoto: string | null;
  coverPhoto: string | null;
  regions: string; // 예: "서울 → 강릉"
  distance: string;
  date: string;
  petNames: string;
  isDemo: boolean;
}

function loadImg(src: string): Promise<HTMLImageElement | null> {
  return new Promise((res) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => res(null);
    i.src = src;
  });
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function cover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const s = Math.max(w / img.width, h / img.height);
  const sw = w / s, sh = h / s;
  ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, x, y, w, h);
}

function paw(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number, color: string) {
  ctx.fillStyle = color;
  const e = (x: number, y: number, rx: number, ry: number) => { ctx.beginPath(); ctx.ellipse(cx + x * s, cy + y * s, rx * s, ry * s, 0, 0, Math.PI * 2); ctx.fill(); };
  e(0, 4, 5.2, 4.4); e(-6.4, -1.6, 2.2, 2.8); e(6.4, -1.6, 2.2, 2.8); e(-2.8, -5.8, 2.1, 2.7); e(2.8, -5.8, 2.1, 2.7);
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number, maxLines: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = w; } else line = test;
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) { lines.length = maxLines; lines[maxLines - 1] += '…'; }
  return lines;
}

export async function renderShareCard(d: ShareInput): Promise<Blob> {
  const W = 1080, H = 1350;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d')!;
  await document.fonts?.ready;
  const font = (w: number, s: number) => `${w} ${s}px "Pretendard Variable", Pretendard, "Apple SD Gothic Neo", sans-serif`;

  ctx.fillStyle = '#FAF9F6'; ctx.fillRect(0, 0, W, H);
  // 상단 사진
  const photoSrc = d.coverPhoto ?? d.petPhoto;
  const img = photoSrc ? await loadImg(photoSrc) : null;
  ctx.save(); roundRect(ctx, 60, 60, 960, 760, 48); ctx.clip();
  if (img) cover(ctx, img, 60, 60, 960, 760);
  else {
    const g = ctx.createLinearGradient(0, 60, 0, 820); g.addColorStop(0, '#F4E9D8'); g.addColorStop(1, '#CFE0D5');
    ctx.fillStyle = g; ctx.fillRect(60, 60, 960, 760);
    paw(ctx, 540, 440, 22, 'rgba(91,140,114,0.55)');
  }
  ctx.restore();
  // 반려견 원형 사진(커버와 다를 때)
  if (d.petPhoto && d.coverPhoto) {
    const pi = await loadImg(d.petPhoto);
    if (pi) {
      ctx.save(); ctx.beginPath(); ctx.arc(900, 820, 92, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill();
      ctx.beginPath(); ctx.arc(900, 820, 82, 0, Math.PI * 2); ctx.clip(); cover(ctx, pi, 818, 738, 164, 164); ctx.restore();
    }
  }
  // 텍스트
  ctx.fillStyle = '#5B8C72'; roundRect(ctx, 60, 880, 64, 64, 18); ctx.fill(); paw(ctx, 92, 912, 2.6, '#fff');
  ctx.fillStyle = '#252B28'; ctx.font = font(800, 34); ctx.fillText('멍로드', 142, 912);
  ctx.fillStyle = '#778079'; ctx.font = font(700, 20); ctx.fillText('MUNG ROAD', 143, 940);
  if (d.isDemo) { ctx.fillStyle = '#FDF1DC'; roundRect(ctx, 820, 892, 200, 46, 23); ctx.fill(); ctx.fillStyle = '#8A5E12'; ctx.font = font(700, 22); ctx.textAlign = 'center'; ctx.fillText('데모 기록', 920, 923); ctx.textAlign = 'left'; }

  ctx.fillStyle = '#252B28'; ctx.font = font(800, 60);
  const lines = wrap(ctx, d.title, 960, 2);
  lines.forEach((l, i) => ctx.fillText(l, 60, 1040 + i * 74));
  const y = 1040 + lines.length * 74 + 20;
  ctx.fillStyle = '#778079'; ctx.font = font(600, 32);
  ctx.fillText(`${d.petNames} · ${d.date}`, 60, y);
  // 통계 칩
  const chips = [d.regions, d.distance];
  let x = 60;
  ctx.font = font(700, 32);
  for (const t of chips) {
    const w = ctx.measureText(t).width + 56;
    ctx.fillStyle = '#E6EFE9'; roundRect(ctx, x, y + 34, w, 68, 34); ctx.fill();
    ctx.fillStyle = '#3F6A53'; ctx.fillText(t, x + 28, y + 80);
    x += w + 16;
  }
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('이미지를 만들지 못했어요.'))), 'image/png'));
}
