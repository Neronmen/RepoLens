import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Khi chạy dev, mọi request /api được chuyển sang backend FastAPI ở cổng 8000,
// nhờ vậy trình duyệt không gặp lỗi CORS và code gọi API không cần biết địa chỉ thật.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:8000',
    },
  },
})
