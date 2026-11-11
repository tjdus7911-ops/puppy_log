// Natural Earth(퍼블릭 도메인) 기반 world-atlas(ISC) 10m 데이터에서
// 대한민국 해안선만 추출·단순화해 src/data/korea-geo.json 으로 저장합니다.
// 실행: npm run build:geo  (결과 파일은 저장소에 커밋되어 있어 평소에는 실행할 필요가 없습니다)
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { feature } from 'topojson-client';

const require = createRequire(import.meta.url);
const topo = JSON.parse(readFileSync(require.resolve('world-atlas/countries-10m.json'), 'utf8'));
const countries = feature(topo, topo.objects.countries);

function ringArea(ring) {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    a += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1]);
  }
  return Math.abs(a / 2);
}

function simplify(ring, tol) {
  const out = [ring[0]];
  for (const p of ring.slice(1)) {
    const last = out[out.length - 1];
    if (Math.hypot(p[0] - last[0], p[1] - last[1]) >= tol) out.push(p);
  }
  return out.map(([x, y]) => [Math.round(x * 1000) / 1000, Math.round(y * 1000) / 1000]);
}

function extract(id, minArea) {
  const f = countries.features.find((c) => c.id === id);
  return f.geometry.coordinates
    .map((poly) => poly[0])
    .filter((ring) => ringArea(ring) >= minArea)
    .map((ring) => simplify(ring, 0.012));
}

const out = {
  source: 'Natural Earth 1:10m via world-atlas (public domain / ISC)',
  south: extract('410', 0.0008),
  north: extract('408', 0.01),
};
writeFileSync(new URL('../src/data/korea-geo.json', import.meta.url), JSON.stringify(out));
console.log('south rings', out.south.length, 'north rings', out.north.length,
  'bytes', JSON.stringify(out).length);
