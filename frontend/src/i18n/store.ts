/** Ngôn ngữ đang chọn, giữ ngoài React để cả code gọi API (không phải component) cũng đọc được. */

export type Lang = 'en' | 'vi'

const STORAGE_KEY = 'repolens.lang'

function detect(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === 'en' || saved === 'vi') return saved
  } catch {
    // trình duyệt chặn localStorage (chế độ riêng tư...) thì dùng ngôn ngữ của trình duyệt
  }
  return typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('vi') ? 'vi' : 'en'
}

let current: Lang = detect()
const listeners = new Set<() => void>()

if (typeof document !== 'undefined') document.documentElement.lang = current

export const getLang = (): Lang => current

export function setLang(lang: Lang): void {
  if (lang === current) return
  current = lang
  try {
    localStorage.setItem(STORAGE_KEY, lang)
  } catch {
    // không lưu được thì lần sau chọn lại, không phải lỗi
  }
  if (typeof document !== 'undefined') document.documentElement.lang = lang
  listeners.forEach((fn) => fn())
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
