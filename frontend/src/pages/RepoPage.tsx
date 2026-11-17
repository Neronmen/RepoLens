import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import LanguageToggle from '../components/LanguageToggle'
import Logo from '../components/Logo'
import Chat from '../features/chat/Chat'
import { useAsk } from '../features/chat/useAsk'
import CodeViewer, { type CodeTarget } from '../features/code/CodeViewer'
import FileTree from '../features/files/FileTree'
import { useI18n } from '../i18n'
import { api, ApiError, type FileInfo, type Repo } from '../lib/api'
import { usePageMeta } from '../lib/usePageMeta'
import styles from './RepoPage.module.css'

type Loaded = { repo: Repo; files: FileInfo[] }

/** Trên màn hẹp chỉ hiện một khung một lúc; từ màn rộng trở lên thì hiện cả ba. */
type Panel = 'chat' | 'files' | 'code'

export default function RepoPage() {
  const { t } = useI18n()
  const { repoId } = useParams()
  const id = Number(repoId)
  const [data, setData] = useState<Loaded | null>(null)
  const [error, setError] = useState<{ status: number; message: string } | null>(null)

  useEffect(() => {
    if (!Number.isInteger(id) || id < 1) return
    let cancelled = false
    Promise.all([api.getRepo(id), api.listFiles(id)])
      .then(([repo, files]) => {
        if (!cancelled) setData({ repo, files })
      })
      .catch((e: unknown) => {
        if (cancelled) return
        setError(
          e instanceof ApiError ? { status: e.status, message: e.message } : { status: 0, message: '' },
        )
      })
    return () => {
      cancelled = true
    }
  }, [id])

  usePageMeta(data ? `${data.repo.owner}/${data.repo.name} · RepoLens` : null, false)

  if (!Number.isInteger(id) || id < 1) return <Problem message={t('repo.badLink')} />
  if (error) {
    return <Problem message={error.status === 404 ? t('repo.gone') : error.message || t('repo.loadFail')} />
  }
  if (!data) {
    return (
      <div className={styles.loading} role="status">
        {t('repo.loading')}
      </div>
    )
  }

  // key={id}: đổi sang repo khác thì toàn bộ hội thoại và khung code được làm mới
  return <Workspace key={id} repo={data.repo} files={data.files} />
}

function Workspace({ repo, files }: Loaded) {
  const { t } = useI18n()
  const { turns, busy, ask, stop } = useAsk(repo.id)
  const semantic = useSemanticReady(repo)
  const [panel, setPanel] = useState<Panel>('chat')
  const [code, setCode] = useState<CodeTarget | null>(null)

  const totals = useMemo(() => {
    let input = 0
    let output = 0
    let ms = 0
    for (const turn of turns) {
      if (!turn.usage) continue
      input += turn.usage.input_tokens
      output += turn.usage.output_tokens
      ms += turn.usage.ms
    }
    return { input, output, ms }
  }, [turns])

  const openCitation = (path: string, start: number, end: number) => {
    setCode({ path, start, end, highlight: true })
    setPanel('code')
  }
  const openFile = (path: string) => {
    setCode({ path, start: 1, end: 1, highlight: false })
    setPanel('code')
  }

  return (
    <div className={styles.app}>
      <header className={styles.bar}>
        <div className={styles.barLeft}>
          <Logo />
          <span className={styles.slash} aria-hidden="true">
            /
          </span>
          <span className={styles.repoName} title={`${repo.owner}/${repo.name}`}>
            {repo.owner}/<b>{repo.name}</b>
          </span>
          <span className={styles.pill}>{t('topbar.counts', { files: repo.file_count, chunks: repo.chunk_count })}</span>
          <span
            className={`${styles.pill} ${semantic ? styles.pillOn : ''}`}
            title={semantic ? t('topbar.semanticTitle') : t('topbar.keywordTitle')}
          >
            {semantic ? t('topbar.semantic') : t('topbar.keywordOnly')}
          </span>
        </div>
        <div className={styles.barRight}>
          {totals.input > 0 && (
            <span className={styles.meter} title={t('topbar.meterTitle')}>
              {t('topbar.meter', {
                input: totals.input.toLocaleString('en-US'),
                output: totals.output.toLocaleString('en-US'),
                secs: (totals.ms / 1000).toFixed(1),
              })}
            </span>
          )}
          <LanguageToggle />
          <button
            type="button"
            className={styles.filesBtn}
            onClick={() => setPanel(panel === 'files' ? 'chat' : 'files')}
            aria-pressed={panel === 'files'}
          >
            {t('nav.files')}
          </button>
          <Link to="/" className={styles.newRepo}>
            {t('nav.newRepo')}
          </Link>
        </div>
      </header>

      <div className={styles.body} data-panel={panel}>
        <aside className={styles.files}>
          <FileTree files={files} activePath={code?.path ?? null} onOpen={openFile} />
        </aside>
        <main className={styles.chat}>
          <Chat turns={turns} busy={busy} onAsk={ask} onStop={stop} onOpenCode={openCitation} />
        </main>
        <section className={styles.code} aria-label={t('repo.codeViewer')}>
          <CodeViewer
            repoId={repo.id}
            owner={repo.owner}
            name={repo.name}
            target={code}
            onBack={() => setPanel('chat')}
          />
        </section>
      </div>
    </div>
  )
}

/** Vector được tạo ở nền sau khi lập chỉ mục, nên hỏi lại vài lần cho tới khi xong. */
function useSemanticReady(repo: Repo): boolean {
  const [ready, setReady] = useState(Boolean(repo.semantic))
  useEffect(() => {
    if (ready) return
    let tries = 0
    const timer = window.setInterval(() => {
      tries += 1
      api
        .getRepo(repo.id)
        .then((r) => {
          if (r.semantic) setReady(true)
        })
        .catch(() => {})
      if (tries >= 12) window.clearInterval(timer) // một phút không xong thì thôi, không hỏi mãi
    }, 5000)
    return () => window.clearInterval(timer)
  }, [repo.id, ready])
  return ready
}

function Problem({ message }: { message: string }) {
  const { t } = useI18n()
  return (
    <div className={styles.problemPage}>
      <Logo />
      <div className={styles.problem} role="alert">
        <h1>{t('repo.problemTitle')}</h1>
        <p>{message}</p>
        <Link to="/" className={styles.newRepo}>
          {t('repo.addRepo')}
        </Link>
      </div>
    </div>
  )
}
