import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import LanguageToggle from '../components/LanguageToggle'
import Logo from '../components/Logo'
import { bootAuth, useAuth } from '../features/auth/authStore'
import GoogleButton from '../features/auth/GoogleButton'
import { useI18n } from '../i18n'
import { api, ApiError, type Conversation } from '../lib/api'
import { RepoView } from './RepoPage'
import styles from './History.module.css'

type State =
  | { phase: 'loading'; restoring: boolean }
  | { phase: 'ready'; conv: Conversation; repoId: number }
  | { phase: 'error'; message: string }

/** Mở lại một cuộc trò chuyện đã lưu: nạp hội thoại, tìm (hoặc lập lại) chỉ mục của repo rồi vào không gian làm việc. */
export default function ConversationPage() {
  const { t } = useI18n()
  const { cid = '' } = useParams()
  const { status } = useAuth()
  const [state, setState] = useState<State>({ phase: 'loading', restoring: false })

  useEffect(() => {
    void bootAuth()
  }, [])

  useEffect(() => {
    if (status !== 'in') return
    let cancelled = false
    ;(async () => {
      try {
        const conv = await api.getConversation(cid)
        if (cancelled) return
        let repoId: number
        try {
          repoId = (await api.findRepo(conv.owner, conv.name)).id
        } catch (e) {
          // chỉ mục đã mất (server miễn phí khởi động lại): lập lại, người dùng không phải làm gì
          if (!(e instanceof ApiError) || e.status !== 404) throw e
          if (!cancelled) setState({ phase: 'loading', restoring: true })
          repoId = (await api.addRepo(`${conv.owner}/${conv.name}`)).id
        }
        if (!cancelled) setState({ phase: 'ready', conv, repoId })
      } catch (e) {
        if (cancelled) return
        const message = e instanceof ApiError && e.status === 404 ? t('conv.notFound') : e instanceof Error ? e.message : t('error.generic')
        setState({ phase: 'error', message })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [cid, status, t])

  if (status === 'out') {
    return (
      <Shell>
        <section className={styles.gate}>
          <h2>{t('history.signInTitle')}</h2>
          <p>{t('history.signInBody')}</p>
          <GoogleButton />
        </section>
      </Shell>
    )
  }
  if (state.phase === 'error') {
    return (
      <Shell>
        <p className={styles.error} role="alert">
          {state.message}
        </p>
        <Link to="/history" className={styles.cta}>
          {t('conv.back')}
        </Link>
      </Shell>
    )
  }
  if (state.phase === 'ready') {
    return <RepoView id={state.repoId} conversation={{ id: state.conv.id, turns: state.conv.turns }} />
  }
  return (
    <Shell>
      <p role="status">{state.phase === 'loading' && state.restoring ? t('conv.restoring') : t('repo.loading')}</p>
      {state.phase === 'loading' && state.restoring && <p className={styles.muted}>{t('conv.restoringHint')}</p>}
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Logo />
        <LanguageToggle />
      </header>
      <main className={styles.main}>{children}</main>
    </div>
  )
}
