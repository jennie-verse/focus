import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    rollupOptions: {
      // 공용 모듈은 동기화를 사용할 때만 공개 URL에서 동적 로드합니다.
      // 해당 URL은 번들에 포함하지 않습니다.
      external: [/^https:\/\/jennie-verse\.github\.io\//],
    },
  },
})
