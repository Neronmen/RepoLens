import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useI18n } from '../../i18n'
import { bootAuth, signOut, useAuth } from './authStore'
import GoogleButton from './GoogleButton'
import { useAuthConfig } from './useAuthConfig'
import styles from './Auth.module.css'

/** Chỗ ở góc phải thanh trên: nút đăng nhập khi chưa đăng nhập, ảnh đại diện kèm menu khi đã đăng nhập. */
export default function UserMenu() {
  const { t } = useI18n()
  const cfg = useAuthConfig()
  const { status, user } = useAuth()
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    void bootAuth()
  }, [])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (!cfg) return <span className={styles.pending} aria-hidden="true" /> // server đang thức dậy, chưa biết có bật đăng nhập không
  if (!cfg.enabled) return null
  if (status === 'out') return <GoogleButton />
  if (!user) return <span className={styles.pending} aria-hidden="true" /> // đang kiểm tra phiên đăng nhập

  const initial = (user.name || user.email).slice(0, 1).toUpperCase()
  return (
    <div className={styles.menuRoot} ref={root}>
      <button
        type="button"
        className={styles.avatarBtn}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('auth.account')}
        onClick={() => setOpen((v) => !v)}
      >
        {user.picture ? (
          <img src={user.picture} alt="" referrerPolicy="no-referrer" className={styles.avatar} />
        ) : (
          <span className={styles.avatar}>{initial}</span>
        )}
      </button>
      {open && (
        <div className={styles.menu} role="menu">
          <div className={styles.who}>
            <b>{user.name || user.email}</b>
            <span>{user.email}</span>
          </div>
          <Link to="/history" role="menuitem" className={styles.item} onClick={() => setOpen(false)}>
            {t('auth.history')}
          </Link>
          <button
            type="button"
            role="menuitem"
            className={styles.item}
            onClick={() => {
              setOpen(false)
              signOut()
            }}
          >
            {t('auth.signOut')}
          </button>
        </div>
      )}
    </div>
  )
}
