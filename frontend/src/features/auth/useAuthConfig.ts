import { useEffect, useState } from 'react'
import { api } from '../../lib/api'

type Config = { enabled: boolean; google_client_id: string }

let cached: Config | null = null
let pending: Promise<Config> | null = null

function fetchConfig(): Promise<Config> {
  pending ??= api
    .authConfig()
    .then((c) => (cached = c))
    // server chưa tới được thì coi như chưa bật đăng nhập, không chặn giao diện
    .catch(() => (cached = { enabled: false, google_client_id: '' }))
  return pending
}

/** Server có bật đăng nhập Google không. null khi chưa biết. */
export function useAuthConfig(): Config | null {
  const [cfg, setCfg] = useState<Config | null>(cached)
  useEffect(() => {
    let alive = true
    if (!cached) fetchConfig().then((c) => alive && setCfg(c))
    return () => {
      alive = false
    }
  }, [])
  return cfg
}
