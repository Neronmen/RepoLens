import { useMemo, useState } from 'react'
import type { FileInfo } from '../../lib/api'
import { useI18n } from '../../i18n'
import { buildTree, collapseChains, filterTree, parentDirs, type TreeNode } from './buildTree'
import { fileBadge } from './fileIcon'
import styles from './FileTree.module.css'

const INDENT = 14 // mỗi cấp thụt vào bấy nhiêu px, đường kẻ dọc cũng nằm theo bước này

export default function FileTree({
  files,
  activePath,
  onOpen,
}: {
  files: FileInfo[]
  activePath: string | null
  onOpen: (path: string) => void
}) {
  const { t } = useI18n()
  const tree = useMemo(() => collapseChains(buildTree(files)), [files])
  const [closed, setClosed] = useState<Set<string>>(() => new Set())
  const [query, setQuery] = useState('')

  const filtering = query.trim() !== ''
  const shown = useMemo(() => filterTree(tree, query), [tree, query])

  // Thư mục chứa file đang xem luôn được mở. Chỉ cần nhớ những thư mục người dùng đã
  // chủ động đóng, nên không cần effect đồng bộ "mở theo file đang chọn".
  const forcedOpen = useMemo(() => new Set(activePath ? parentDirs(activePath) : []), [activePath])

  function toggle(path: string) {
    setClosed((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  return (
    <nav aria-label={t('files.nav')} className={styles.nav}>
      <div className={styles.head}>
        <h2 className={styles.heading}>{t('files.explorer')}</h2>
        <span className={styles.count}>{files.length}</span>
      </div>

      <div className={styles.filter}>
        <SearchIcon />
        <label htmlFor="file-filter" className="sr-only">
          {t('files.filterLabel')}
        </label>
        <input
          id="file-filter"
          type="search"
          value={query}
          placeholder={t('files.filter')}
          onChange={(e) => setQuery(e.target.value)}
          autoComplete="off"
          spellCheck={false}
        />
      </div>

      <div className={styles.scroll}>
        {shown.length === 0 ? (
          <p className={styles.none}>{t('files.none', { q: query.trim() })}</p>
        ) : (
          <ul className={styles.list} role="tree">
            <Nodes
              nodes={shown}
              depth={0}
              closed={closed}
              forcedOpen={forcedOpen}
              filtering={filtering}
              activePath={activePath}
              onToggle={toggle}
              onOpen={onOpen}
            />
          </ul>
        )}
      </div>
    </nav>
  )
}

type NodesProps = {
  nodes: TreeNode[]
  depth: number
  closed: Set<string>
  forcedOpen: Set<string>
  filtering: boolean
  activePath: string | null
  onToggle: (path: string) => void
  onOpen: (path: string) => void
}

function Nodes({ nodes, depth, ...rest }: NodesProps) {
  const { t } = useI18n()
  const pad = 16 + depth * INDENT
  const guides = Array.from({ length: depth }, (_, i) => 22 + i * INDENT)

  return (
    <>
      {nodes.map((n) => {
        if (n.kind === 'file') {
          const active = n.path === rest.activePath
          const badge = fileBadge(n.name)
          return (
            <li key={n.path} role="none" className={styles.row}>
              <Guides lefts={guides} />
              <button
                type="button"
                role="treeitem"
                aria-selected={active}
                className={`${styles.item} ${active ? styles.active : ''}`}
                style={{ paddingLeft: pad }}
                title={t('files.tooltip', { path: n.path, lines: n.info.line_count })}
                onClick={() => rest.onOpen(n.path)}
              >
                <span className={styles.spacer} aria-hidden="true" />
                <span className={styles.badge} style={{ background: badge.bg, color: badge.fg }} aria-hidden="true">
                  {badge.label}
                </span>
                <span className={styles.name}>{n.name}</span>
              </button>
            </li>
          )
        }

        // đang lọc thì mở hết để thấy mọi kết quả; còn lại theo lựa chọn của người dùng
        const open = rest.filtering || !rest.closed.has(n.path) || rest.forcedOpen.has(n.path)
        return (
          <li key={n.path} role="none" className={styles.row}>
            <Guides lefts={guides} />
            <button
              type="button"
              role="treeitem"
              aria-expanded={open}
              className={`${styles.item} ${styles.dir}`}
              style={{ paddingLeft: pad }}
              onClick={() => rest.onToggle(n.path)}
            >
              <Chevron open={open} />
              <FolderIcon open={open} />
              <span className={styles.name}>{n.name}</span>
            </button>
            {open && (
              <ul role="group" className={styles.list}>
                <Nodes nodes={n.children} depth={depth + 1} {...rest} />
              </ul>
            )}
          </li>
        )
      })}
    </>
  )
}

function Guides({ lefts }: { lefts: number[] }) {
  return (
    <>
      {lefts.map((left) => (
        <span key={left} className={styles.guide} style={{ left }} aria-hidden="true" />
      ))}
    </>
  )
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" className={styles.chevron} data-open={open}>
      <path d="M4.5 2.5L8 6l-3.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function FolderIcon({ open }: { open: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" className={styles.folder} data-open={open}>
      <path
        d="M1.5 4.2c0-.7.5-1.2 1.2-1.2h3.1l1.4 1.5h6.1c.7 0 1.2.5 1.2 1.2v6.6c0 .7-.5 1.2-1.2 1.2H2.7c-.7 0-1.2-.5-1.2-1.2z"
        strokeWidth="1.2"
      />
    </svg>
  )
}

function SearchIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" className={styles.searchIcon}>
      <circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}
