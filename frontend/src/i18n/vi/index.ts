import type en from '../en'
import app from './app'
import landing from './landing'

// Tiếng Việt phải có đủ mọi khóa của tiếng Anh (TypeScript báo lỗi ngay nếu thiếu), trừ các
// khóa số ít `.one`: tiếng Việt không chia số ít/số nhiều nên chỉ cần `.other`.
const vi: Record<Exclude<keyof typeof en, `${string}.one`>, string> = { ...app, ...landing }

export default vi
