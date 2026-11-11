import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base: './' — GitHub Pages 하위 경로나 정적 파일 서버 어디서든 열리도록 상대 경로로 빌드합니다.
export default defineConfig({
  base: './',
  plugins: [react()],
});
