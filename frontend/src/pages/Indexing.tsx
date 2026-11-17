import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import LanguageToggle from '../components/LanguageToggle'
import Logo from '../components/Logo'
import { translate, getLang, useI18n } from '../i18n'
import { api, ApiError, type IndexResult } from '../lib/api'
import styles from './Indexing.module.css'

// React ở chế độ dev chạy mỗi effect hai lần. Nếu gửi hai request lập chỉ mục
// cùng lúc thì request thứ hai bị server từ chối (nó chỉ làm một repo mỗi lần).
// Giữ lại request đang chạy theo từng repo để hai lần chạy dùng chung một kết quả.
const inflight = new Map<string, Promise<IndexResult>>()

function startIndexing(repo: string): Promise<IndexResult> {
  let p = inflight.get(repo)
  if (!p) {
    p = api.addRepo(repo).finally(() => inflight.delete(repo))
    inflight.set(repo, p)
  }
  return p
}

type State =
  | { status: 'running' }
  | { status: 'done'; result: IndexResult }
  | { status: 'error'; message: string; retryable: boolean }

const MIN_DONE_MS = 1100 // để người dùng kịp thấy các bước hoàn thành rồi mới chuyển trang

export default function Indexing() {
  const { t } = useI18n()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const repo = (params.get('repo') ?? '').trim()
  const [state, setState] = useState<State>({ status: 'running' })
  const [seconds, setSeconds] = useState(0)

  useEffect(() => {
    if (!repo) return
    let cancelled = false
    let timer: number | undefined

    startIndexing(repo)
      .then((result) => {
        if (cancelled) return
        setState({ status: 'done', result })
        timer = window.setTimeout(() => navigate(`/r/${result.id}`, { replace: true }), MIN_DONE_MS)
      })
      .catch((e: unknown) => {
        if (cancelled) return
        const status = e instanceof ApiError ? e.status : 0
        setState({
          status: 'error',
          // lỗi từ server đã đúng ngôn ngữ lúc nó được tạo; lỗi lạ thì dùng câu chung
          message: e instanceof Error && e.message ? e.message : translate(getLang(), 'error.generic'),
          // 429 và 503 là server đang bận, thử lại sau vài giây là được
          retryable: status === 429 || status === 503 || status === 0,
        })
      })

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [repo, navigate])

  useEffect(() => {
    if (state.status !== 'running') return
    const id = window.setInterval(() => setSeconds((s) => s + 1), 1000)
    return () => window.clearInterval(id)
  }, [state.status])

  if (!repo) {
    return (
      <Shell>
        <Problem message={t('index.noRepo')} retryable={false} />
      </Shell>
    )
  }

  const done = state.status === 'done'
  const result = state.status === 'done' ? state.result : null

  return (
    <Shell>
      <div className={styles.grid}>
        <div className={styles.left}>
          <p className={styles.eyebrow}>{state.status === 'error' ? t('index.eyebrowError') : t('index.eyebrow')}</p>
          <h1 className={styles.title}>
            {/* gợi ý chỗ ngắt dòng ở dấu "/" để tên repo không bị bẻ giữa chữ */}
            {repo.split('/').map((part, i) => (
              <span key={i}>
                {i > 0 && <wbr />}
                {i > 0 && '/'}
                {part}
              </span>
            ))}
          </h1>
          {state.status === 'error' ? (
            <Problem message={state.message} retryable={state.retryable} />
          ) : (
            <>
              <p className={styles.lead}>{t('index.lead')}</p>
              <div
                className={styles.bar}
                role="progressbar"
                aria-label={t('index.progress')}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={done ? 100 : undefined}
              >
                <div className={done ? styles.barFull : styles.barRun} />
              </div>
              <p className={styles.time} aria-live="polite">
                {done ? t('index.ready') : t('index.elapsed', { n: seconds })}
              </p>
              {!done && seconds >= 10 && <p className={styles.slow}>{t('index.slow')}</p>}
            </>
          )}
        </div>

        {state.status !== 'error' && (
          <div className={styles.card}>
            <div className={styles.cardHead}>
              <span className={styles.dot} />
              <span className={styles.dot} />
              <span className={styles.dot} />
              <span className={styles.cardTitle}>{t('index.log')}</span>
            </div>
            <ul className={styles.log} aria-live="polite">
              <Step
                state={done ? 'done' : 'running'}
                label={t('index.stepDownload')}
                detail={done ? t('index.done') : t('index.running')}
              />
              <Step
                state={done ? 'done' : 'todo'}
                label={t('index.stepFilter')}
                detail={result ? t('index.kept', { kept: result.file_count, skipped: result.skipped }) : ''}
              />
              <Step
                state={done ? 'done' : 'todo'}
                label={t('index.stepChunks')}
                detail={result ? t('index.chunks', { n: result.chunk_count }) : ''}
              />
              <Step state={done ? 'done' : 'todo'} label={t('index.stepReady')} detail="" />
            </ul>
            <p className={styles.foot}>{t('index.skipNote')}</p>
          </div>
        )}
      </div>
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

function Problem({ message, retryable }: { message: string; retryable: boolean }) {
  const { t } = useI18n()
  return (
    <div className={styles.problem} role="alert">
      <p>{message}</p>
      <div className={styles.actions}>
        {retryable && (
          <button type="button" className={styles.retry} onClick={() => window.location.reload()}>
            {t('index.retry')}
          </button>
        )}
        <Link to="/" className={styles.other}>
          {t('index.other')}
        </Link>
      </div>
    </div>
  )
}

const MARK = { done: '✓', running: '›', todo: '○' } as const

function Step({ state, label, detail }: { state: 'done' | 'running' | 'todo'; label: string; detail: string }) {
  return (
    <li className={`${styles.step} ${styles[state]}`}>
      <span className={styles.mark} aria-hidden="true">
        {MARK[state]}
      </span>
      <span className={styles.stepLabel}>
        {label}
        {state === 'running' && <span className={styles.cursor} aria-hidden="true">_</span>}
      </span>
      <span className={styles.detail}>{detail}</span>
    </li>
  )
}
