/** Nhớ repo nào ứng với id nào, để khi server miễn phí khởi động lại (mất chỉ mục) còn tự lập chỉ mục lại được. */

const KEY = 'repolens.recent'
const MAX = 30

function read(): Record<string, string> {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(KEY) ?? '{}')
    return v && typeof v === 'object' ? (v as Record<string, string>) : {}
  } catch {
    return {}
  }
}

export function rememberRepo(id: number, owner: string, name: string): void {
  try {
    const map = read()
    map[String(id)] = `${owner}/${name}`
    const keys = Object.keys(map)
    for (const k of keys.slice(0, Math.max(0, keys.length - MAX))) delete map[k]
    localStorage.setItem(KEY, JSON.stringify(map))
  } catch {
    // không lưu được thì thôi
  }
}

export function recallRepo(id: number): string | null {
  const v = read()[String(id)]
  return typeof v === 'string' && /^[\w.-]+\/[\w.-]+$/.test(v) ? v : null
}
