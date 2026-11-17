import { useEffect, useState } from 'react'
import { api } from '../../lib/api'

type Config = { enabled: boolean; google_client_id: string }

const KEY = 'repolens.authcfg'
// Server miễn phí ngủ khi vắng khách, lần đầu gọi có thể chờ cả phút. Thử lại thưa dần thay vì bỏ cuộc.
const RETRY_MS = [2000, 4000, 8000, 15000, 30000]

function load(): Config | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const c = JSON.parse(raw) as Config
    return typeof c.enabled === 'boolean' && typeof c.google_client_id === 'string' ? c : null
  } catch {
    return null
  }
}

function save(c: Config) {
  try {
    localStorage.setItem(KEY, JSON.stringify(c))
  } catch {
    // không lưu được thì lần sau hỏi lại server, không sao
  }
}

// Nhớ lần trước để nút đăng nhập hiện ngay, không phải chờ server thức dậy.
let cached: Config | null = load()
let pending: Promise<Config> | null = null

async function fetchConfig(): Promise<Config> {
  for (let i = 0; ; i++) {
    try {
      const c = await api.authConfig()
      cached = c
      save(c)
      return c
    } catch {
      // Lỗi mạng hoặc server đang dậy: không được coi là "chưa bật đăng nhập" rồi nhớ luôn,
      // đó là lý do ảnh đại diện lúc có lúc không. Cứ chờ rồi thử lại.
      await new Promise((r) => setTimeout(r, RETRY_MS[Math.min(i, RETRY_MS.length - 1)]))
    }
  }
}

/** Server có bật đăng nhập Google không. null khi chưa biết. */
export function useAuthConfig(): Config | null {
  const [cfg, setCfg] = useState<Config | null>(cached)
  useEffect(() => {
    let alive = true
    pending ??= fetchConfig().finally(() => {
      pending = null
    })
    pending.then((c) => alive && setCfg(c))
    return () => {
      alive = false
    }
  }, [])
  return cfg
}
