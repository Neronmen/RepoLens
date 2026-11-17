import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import LanguageToggle from '../components/LanguageToggle'
import Logo from '../components/Logo'
import { deleteAccount, useAuth } from '../features/auth/authStore'
import GoogleButton from '../features/auth/GoogleButton'
import UserMenu from '../features/auth/UserMenu'
import { useI18n } from '../i18n'
import { api, type ConversationSummary } from '../lib/api'
import { usePageMeta } from '../lib/usePageMeta'
import styles from './History.module.css'

function ago(iso: string, lang: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000
  const rtf = new Intl.RelativeTimeFormat(lang, { numeric: 'auto' })
  if (diff < 60) return rtf.format(0, 'second')
  if (diff < 3600) return rtf.format(-Math.round(diff / 60), 'minute')
  if (diff < 86400) return rtf.format(-Math.round(diff / 3600), 'hour')
  if (diff < 86400 * 30) return rtf.format(-Math.round(diff / 86400), 'day')
  return new Date(iso).toLocaleDateString(lang)
}

export default function History() {
  const { t, tp, lang } = useI18n()
  usePageMeta('RepoLens', false)
  const { status } = useAuth()
  const [items, setItems] = useState<ConversationSummary[] | null>(null)
  const [error, setError] = useState('')

  const load = useCallback(() => {
    setError('')
    api
      .listConversations()
      .then(setItems)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : t('history.loadFail')))
  }, [t])

  useEffect(() => {
    if (status === 'in') load()
  }, [status, load])

  async function remove(id: string) {
    if (!window.confirm(t('history.confirmDelete'))) return
    try {
      await api.deleteConversation(id)
      setItems((cur) => cur?.filter((c) => c.id !== id) ?? null)
    } catch (e) {
      setError(e instanceof Error ? e.message : t('history.loadFail'))
    }
  }

  async function removeAccount() {
    if (!window.confirm(t('history.deleteAccountConfirm'))) return
    try {
      await deleteAccount()
    } catch (e) {
      setError(e instanceof Error ? e.message : t('history.loadFail'))
    }
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Logo />
        <div className={styles.right}>
          <LanguageToggle />
          <UserMenu />
        </div>
      </header>

      <main className={styles.main}>
        <h1>{t('history.title')}</h1>

        {status === 'out' && (
          <section className={styles.gate}>
            <h2>{t('history.signInTitle')}</h2>
            <p>{t('history.signInBody')}</p>
            <GoogleButton />
          </section>
        )}

        {status === 'unknown' && (
          <p className={styles.muted} role="status">
            {t('repo.loading')}
          </p>
        )}

        {status === 'in' && (
          <>
            <p className={styles.lead}>{t('history.lead')}</p>
            {error && (
              <p className={styles.error} role="alert">
                {error}{' '}
                <button type="button" className={styles.link} onClick={load}>
                  {t('chat.retry')}
                </button>
              </p>
            )}
            {!items && !error && (
              <p className={styles.muted} role="status">
                {t('repo.loading')}
              </p>
            )}
            {items && items.length === 0 && (
              <div className={styles.empty}>
                <p>{t('history.empty')}</p>
                <p className={styles.muted}>{t('history.emptyHint')}</p>
                <Link to="/" className={styles.cta}>
                  {t('history.start')}
                </Link>
              </div>
            )}
            {items && items.length > 0 && (
              <ul className={styles.list}>
                {items.map((c) => (
                  <li key={c.id} className={styles.row}>
                    <Link to={`/c/${c.id}`} className={styles.item}>
                      <span className={styles.repo}>
                        {c.owner}/<b>{c.name}</b>
                      </span>
                      <span className={styles.title}>{c.title || '…'}</span>
                      <span className={styles.meta}>
                        {tp('history.turns', c.turn_count ?? 0)} · {ago(c.updated_at, lang)}
                      </span>
                    </Link>
                    <button type="button" className={styles.del} onClick={() => remove(c.id)} aria-label={`${t('history.delete')}: ${c.title}`}>
                      {t('history.delete')}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <button type="button" className={styles.danger} onClick={removeAccount}>
              {t('history.deleteAccount')}
            </button>
          </>
        )}
      </main>
    </div>
  )
}
