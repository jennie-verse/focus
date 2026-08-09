import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    rollupOptions: {
      // 공용 모듈 shared/v1/sync.js 는 다른 저장소에 있어 번들에 넣지 않습니다.
      // 같은 오리진(jennie-verse.github.io)의 ES module 로 브라우저가 직접 불러옵니다.
      external: [/^https:\/\/jennie-verse\.github\.io\//],
    },
  },
})
