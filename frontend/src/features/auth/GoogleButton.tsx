import { useEffect, useRef, useState } from 'react'
import { useI18n } from '../../i18n'
import { signInWithGoogle } from './authStore'
import { useAuthConfig } from './useAuthConfig'
import styles from './Auth.module.css'

type GsiId = {
  initialize: (o: { client_id: string; callback: (r: { credential?: string }) => void; use_fedcm_for_prompt?: boolean }) => void
  renderButton: (el: HTMLElement, o: Record<string, unknown>) => void
}
declare global {
  interface Window {
    google?: { accounts: { id: GsiId } }
  }
}

const SRC = 'https://accounts.google.com/gsi/client'
let scriptPromise: Promise<void> | null = null

function loadGsi(): Promise<void> {
  scriptPromise ??= new Promise((resolve, reject) => {
    if (window.google?.accounts) return resolve()
    const s = document.createElement('script')
    s.src = SRC
    s.async = true
    s.onload = () => resolve()
    s.onerror = () => {
      scriptPromise = null // cho phép thử lại lần sau (mạng chập chờn, bị chặn tạm...)
      reject(new Error('gsi'))
    }
    document.head.appendChild(s)
  })
  return scriptPromise
}

/** Nút "Đăng nhập bằng Google" chính chủ của Google. Mật khẩu không bao giờ đi qua RepoLens. */
export default function GoogleButton() {
  const { t } = useI18n()
  const cfg = useAuthConfig()
  const host = useRef<HTMLDivElement>(null)
  const [failed, setFailed] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!cfg?.enabled || !host.current) return
    let cancelled = false
    loadGsi()
      .then(() => {
        if (cancelled || !host.current) return
        window.google!.accounts.id.initialize({
          client_id: cfg.google_client_id,
          callback: ({ credential }) => {
            if (!credential) return
            setError('')
            signInWithGoogle(credential).catch((e: unknown) => setError(e instanceof Error ? e.message : t('error.generic')))
          },
        })
        window.google!.accounts.id.renderButton(host.current, {
          type: 'standard',
          theme: 'filled_black',
          size: 'large',
          shape: 'pill',
          text: 'signin_with',
        })
      })
      .catch(() => !cancelled && setFailed(true))
    return () => {
      cancelled = true
    }
  }, [cfg, t])

  if (!cfg?.enabled) return null
  return (
    <div className={styles.googleWrap}>
      <div ref={host} />
      {failed && <p className={styles.hint}>{t('auth.gsiFailed')}</p>}
      {error && (
        <p className={styles.hint} role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
