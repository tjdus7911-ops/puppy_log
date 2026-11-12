import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createHash } from 'node:crypto';

/**
 * 설치형 앱(PWA) 서비스 워커 생성: 빌드 결과물 목록을 미리 캐시해 오프라인에서도 열리게 합니다.
 * 파일 이름에 해시가 붙으므로 빌드마다 캐시 버전이 바뀌고, 이전 캐시는 정리됩니다.
 */
function pwaServiceWorker(): Plugin {
  let outDir = 'dist';
  return {
    name: 'mungroad-pwa-sw',
    apply: 'build',
    configResolved(c) { outDir = c.build.outDir; },
    closeBundle() {
      const files: string[] = [];
      const walk = (d: string) => readdirSync(d).forEach((f) => { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else files.push(relative(outDir, p).split('\\').join('/')); });
      walk(outDir);
      const precache = files.filter((f) => f !== 'sw.js' && !f.endsWith('.map'));
      const version = createHash('sha1').update(precache.join('|')).digest('hex').slice(0, 10);
      const tpl = readFileSync('src/pwa/sw-template.js', 'utf8');
      writeFileSync(join(outDir, 'sw.js'), tpl.replace('__VERSION__', version).replace('__PRECACHE__', JSON.stringify(['./', ...precache])));
    },
  };
}

// base: './' — GitHub Pages 하위 경로나 정적 파일 서버 어디서든 열리도록 상대 경로로 빌드합니다.
export default defineConfig({
  base: './',
  plugins: [react(), pwaServiceWorker()],
});
