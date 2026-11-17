import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import LanguageToggle from '../components/LanguageToggle'
import Logo from '../components/Logo'
import UserMenu from '../features/auth/UserMenu'
import Chat from '../features/chat/Chat'
import { useAsk, type SavedConversation } from '../features/chat/useAsk'
import CodeViewer, { type CodeTarget } from '../features/code/CodeViewer'
import FileTree from '../features/files/FileTree'
import Resizer from '../features/layout/Resizer'
import { LIMITS, maxCodeWidth, useLayout } from '../features/layout/useLayout'
import { useI18n } from '../i18n'
import { api, ApiError, type FileInfo, type Repo } from '../lib/api'
import { recallRepo, rememberRepo } from '../lib/recent'
import { useOnline } from '../lib/useOnline'
import { usePageMeta } from '../lib/usePageMeta'
import styles from './RepoPage.module.css'

type Loaded = { repo: Repo; files: FileInfo[] }

/** Trên màn hẹp chỉ hiện một khung một lúc; từ màn rộng trở lên các khung đứng cạnh nhau. */
type Panel = 'chat' | 'files' | 'code'

export default function RepoPage() {
  const { t } = useI18n()
  const { repoId } = useParams()
  const id = Number(repoId)
  if (!Number.isInteger(id) || id < 1) return <Problem message={t('repo.badLink')} />
  return <RepoView id={id} />
}

/** Tải repo + danh sách file rồi dựng không gian làm việc. Dùng cho cả /r/:id lẫn /c/:id (cuộc trò chuyện đã lưu). */
export function RepoView({ id, conversation }: { id: number; conversation?: SavedConversation }) {
  const { t } = useI18n()
  const [data, setData] = useState<Loaded | null>(null)
  const [error, setError] = useState<{ status: number; message: string } | null>(null)

  useEffect(() => {
    let cancelled = false
    Promise.all([api.getRepo(id), api.listFiles(id)])
      .then(([repo, files]) => {
        if (cancelled) return
        rememberRepo(repo.id, repo.owner, repo.name)
        setData({ repo, files })
      })
      .catch((e: unknown) => {
        if (cancelled) return
        setError(e instanceof ApiError ? { status: e.status, message: e.message } : { status: 0, message: '' })
      })
    return () => {
      cancelled = true
    }
  }, [id])

  usePageMeta(data ? `${data.repo.owner}/${data.repo.name} · RepoLens` : null, false)

  if (error) {
    // Server miễn phí khởi động lại thì mất chỉ mục. Nhớ được repo nào ứng với id này thì tự lập chỉ mục lại.
    const known = error.status === 404 ? recallRepo(id) : null
    if (known) return <Navigate to={`/index?repo=${encodeURIComponent(known)}`} replace />
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
  return <Workspace key={id} repo={data.repo} files={data.files} conversation={conversation} />
}

function Workspace({ repo, files, conversation }: Loaded & { conversation?: SavedConversation }) {
  const { t } = useI18n()
  const repoRef = useMemo(() => ({ id: repo.id, owner: repo.owner, name: repo.name }), [repo.id, repo.owner, repo.name])
  const { turns, busy, reconnecting, ask, stop } = useAsk(repoRef, conversation)
  const semantic = useSemanticReady(repo)
  const online = useOnline()
  const { layout, update, reset } = useLayout()
  const [panel, setPanel] = useState<Panel>('chat')
  const [code, setCode] = useState<CodeTarget | null>(null)
  const bodyRef = useRef<HTMLDivElement>(null)

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

  // Mở khung code mà vẫn chừa đủ chỗ cho chat: nếu không đủ thì thu khung file lại thay vì bóp chat.
  const showCode = useCallback(
    (target: CodeTarget) => {
      const bodyW = bodyRef.current?.clientWidth ?? 1400
      const filesW = layout.filesOpen ? layout.filesW : 0
      if (bodyW - filesW - LIMITS.chatMin < LIMITS.code.min && layout.filesOpen) {
        update({ filesOpen: false, codeW: Math.min(layout.codeW, maxCodeWidth(bodyW, 0)) })
      } else if (layout.codeW > maxCodeWidth(bodyW, filesW)) {
        update({ codeW: maxCodeWidth(bodyW, filesW) })
      }
      setCode(target)
      setPanel('code')
    },
    [layout, update],
  )

  const openCitation = (path: string, start: number, end: number) => showCode({ path, start, end, highlight: true })
  const openFile = (path: string) => showCode({ path, start: 1, end: 1, highlight: false })
  const closeCode = () => {
    setCode(null)
    setPanel('chat')
  }

  // chỉnh độ rộng: kẹp theo giới hạn và theo chỗ còn lại, để khung chat không bao giờ bị bóp quá nhỏ
  const resizeFiles = (w: number) => {
    const bodyW = bodyRef.current?.clientWidth ?? 1400
    const room = bodyW - LIMITS.chatMin - (code ? layout.codeW : 0)
    update({ filesW: Math.max(LIMITS.files.min, Math.min(LIMITS.files.max, room, w)) })
  }
  const resizeCode = (w: number) => {
    const bodyW = bodyRef.current?.clientWidth ?? 1400
    update({ codeW: Math.max(LIMITS.code.min, Math.min(maxCodeWidth(bodyW, layout.filesOpen ? layout.filesW : 0), w)) })
  }

  const filesShown = layout.filesOpen
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
          {/* màn rộng: thu/mở khung file; màn hẹp: chuyển sang khung file */}
          <button
            type="button"
            className={styles.filesToggle}
            onClick={() => update({ filesOpen: !layout.filesOpen })}
            aria-pressed={filesShown}
            title={t(filesShown ? 'nav.hideFiles' : 'nav.showFiles')}
          >
            <SidebarIcon /> <span>{t('nav.files')}</span>
          </button>
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
          <UserMenu />
        </div>
      </header>

      {!online && (
        <div className={styles.offline} role="status">
          {t('net.offline')}
        </div>
      )}

      <div className={styles.body} data-panel={panel} ref={bodyRef}>
        {filesShown && (
          <>
            <aside className={styles.files} style={{ width: layout.filesW }}>
              <FileTree files={files} activePath={code?.path ?? null} onOpen={openFile} />
            </aside>
            <Resizer
              label={t('layout.resizeFiles')}
              width={layout.filesW}
              sign={1}
              onResize={resizeFiles}
              onReset={() => update({ filesW: LIMITS.files.def })}
            />
          </>
        )}
        <main className={styles.chat}>
          <Chat turns={turns} busy={busy} reconnecting={reconnecting} onAsk={ask} onStop={stop} onOpenCode={openCitation} />
        </main>
        {code && (
          <>
            <Resizer
              label={t('layout.resizeCode')}
              width={layout.codeW}
              sign={-1}
              onResize={resizeCode}
              onReset={() => update({ codeW: LIMITS.code.def })}
            />
            <section className={styles.code} style={{ width: layout.codeW }} aria-label={t('repo.codeViewer')}>
              <CodeViewer
                repoId={repo.id}
                owner={repo.owner}
                name={repo.name}
                target={code}
                onClose={closeCode}
              />
            </section>
          </>
        )}
      </div>
      {/* nút đặt lại bố cục, chỉ hiện khi người dùng đã kéo lệch khỏi mặc định */}
      {(layout.filesW !== LIMITS.files.def || layout.codeW !== LIMITS.code.def || !layout.filesOpen) && (
        <button type="button" className={styles.resetLayout} onClick={reset}>
          {t('layout.reset')}
        </button>
      )}
    </div>
  )
}

function SidebarIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <rect x="1.5" y="2.5" width="13" height="11" rx="2" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M6 2.5v11" stroke="currentColor" strokeWidth="1.4" />
    </svg>
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
