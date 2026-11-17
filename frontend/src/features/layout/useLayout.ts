import { useCallback, useEffect, useState } from 'react'

/** Cách người dùng sắp xếp ba khung. Nhớ lại ở trình duyệt để lần sau mở ra vẫn đúng ý họ. */
export type Layout = {
  filesOpen: boolean
  filesW: number
  codeW: number
}

export const LIMITS = {
  files: { min: 180, max: 480, def: 248 },
  code: { min: 320, max: 1100, def: 560 },
  chatMin: 380, // khung chat không bao giờ hẹp hơn mức này
}

const KEY = 'repolens.layout.v1'
const DEFAULT: Layout = { filesOpen: true, filesW: LIMITS.files.def, codeW: LIMITS.code.def }

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

function load(): Layout {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<Layout> | null
    if (!raw || typeof raw !== 'object') return DEFAULT
    return {
      filesOpen: typeof raw.filesOpen === 'boolean' ? raw.filesOpen : DEFAULT.filesOpen,
      filesW: clamp(Number(raw.filesW) || DEFAULT.filesW, LIMITS.files.min, LIMITS.files.max),
      codeW: clamp(Number(raw.codeW) || DEFAULT.codeW, LIMITS.code.min, LIMITS.code.max),
    }
  } catch {
    return DEFAULT
  }
}

export function useLayout() {
  const [layout, setLayout] = useState<Layout>(load)

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(layout))
    } catch {
      // không lưu được thì thôi
    }
  }, [layout])

  const update = useCallback((patch: Partial<Layout>) => setLayout((l) => ({ ...l, ...patch })), [])
  const reset = useCallback(() => setLayout({ ...DEFAULT, filesOpen: true }), [])
  return { layout, update, reset }
}

/** Chỗ còn lại cho khung code khi khung file đang ở độ rộng `filesW` (0 nếu đang thu lại). */
export function maxCodeWidth(bodyWidth: number, filesW: number): number {
  return Math.max(LIMITS.code.min, Math.min(LIMITS.code.max, bodyWidth - filesW - LIMITS.chatMin))
}
