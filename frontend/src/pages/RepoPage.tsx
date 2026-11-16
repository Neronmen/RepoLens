import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import Logo from '../components/Logo'
import Chat from '../features/chat/Chat'
import { useAsk } from '../features/chat/useAsk'
import CodeViewer, { type CodeTarget } from '../features/code/CodeViewer'
import FileTree from '../features/files/FileTree'
import { api, ApiError, type FileInfo, type Repo } from '../lib/api'
import styles from './RepoPage.module.css'

type Loaded = { repo: Repo; files: FileInfo[] }

/** Trên màn hẹp chỉ hiện một khung một lúc; từ màn rộng trở lên thì hiện cả ba. */
type Panel = 'chat' | 'files' | 'code'

export default function RepoPage() {
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
          e instanceof ApiError
            ? { status: e.status, message: e.message }
            : { status: 0, message: 'Could not load this repo.' },
        )
      })
    return () => {
      cancelled = true
    }
  }, [id])

  useEffect(() => {
    if (data) document.title = `${data.repo.owner}/${data.repo.name} · RepoLens`
    return () => {
      document.title = 'RepoLens: ask a repo, get receipts'
    }
  }, [data])

  if (!Number.isInteger(id) || id < 1) return <Problem message="This link doesn't point to a repo." />
  if (error) {
    return (
      <Problem
        message={
          error.status === 404
            ? "This repo isn't on the server any more. The free server keeps only the most recent repos."
            : error.message
        }
      />
    )
  }
  if (!data) {
    return (
      <div className={styles.loading} role="status">
        Loading repo…
      </div>
    )
  }

  // key={id}: đổi sang repo khác thì toàn bộ hội thoại và khung code được làm mới
  return <Workspace key={id} repo={data.repo} files={data.files} />
}

function Workspace({ repo, files }: Loaded) {
  const { turns, busy, ask, stop } = useAsk(repo.id)
  const [panel, setPanel] = useState<Panel>('chat')
  const [code, setCode] = useState<CodeTarget | null>(null)

  const totals = useMemo(() => {
    let input = 0
    let output = 0
    let ms = 0
    for (const t of turns) {
      if (!t.usage) continue
      input += t.usage.input_tokens
      output += t.usage.output_tokens
      ms += t.usage.ms
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
          <span className={styles.pill}>
            {repo.file_count} files · {repo.chunk_count} chunks
          </span>
        </div>
        <div className={styles.barRight}>
          {totals.input > 0 && (
            <span className={styles.meter} title="Totals for this conversation">
              {totals.input.toLocaleString('en-US')} in · {totals.output.toLocaleString('en-US')} out ·{' '}
              {(totals.ms / 1000).toFixed(1)}s
            </span>
          )}
          <button
            type="button"
            className={styles.filesBtn}
            onClick={() => setPanel(panel === 'files' ? 'chat' : 'files')}
            aria-pressed={panel === 'files'}
          >
            Files
          </button>
          <Link to="/" className={styles.newRepo}>
            New repo
          </Link>
        </div>
      </header>

      <div className={styles.body} data-panel={panel}>
        <aside className={styles.files}>
          <FileTree
            files={files}
            activePath={code?.path ?? null}
            onOpen={openFile}
          />
        </aside>
        <main className={styles.chat}>
          <Chat turns={turns} busy={busy} onAsk={ask} onStop={stop} onOpenCode={openCitation} />
        </main>
        <section className={styles.code} aria-label="Code viewer">
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

function Problem({ message }: { message: string }) {
  return (
    <div className={styles.problemPage}>
      <Logo />
      <div className={styles.problem} role="alert">
        <h1>Couldn't open this repo</h1>
        <p>{message}</p>
        <Link to="/" className={styles.newRepo}>
          Add a repo
        </Link>
      </div>
    </div>
  )
}
