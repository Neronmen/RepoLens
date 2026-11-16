import { useMemo, useState } from 'react'
import type { FileInfo } from '../../lib/api'
import { buildTree, collapseChains, parentDirs, type TreeNode } from './buildTree'
import styles from './FileTree.module.css'

export default function FileTree({
  files,
  activePath,
  onOpen,
}: {
  files: FileInfo[]
  activePath: string | null
  onOpen: (path: string) => void
}) {
  const tree = useMemo(() => collapseChains(buildTree(files)), [files])
  const [closed, setClosed] = useState<Set<string>>(() => new Set())

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
    <nav aria-label="Files in the repository" className={styles.nav}>
      <h2 className={styles.heading}>Files</h2>
      <ul className={styles.list} role="tree">
        <Nodes nodes={tree} depth={0} closed={closed} forcedOpen={forcedOpen} activePath={activePath} onToggle={toggle} onOpen={onOpen} />
      </ul>
    </nav>
  )
}

type NodesProps = {
  nodes: TreeNode[]
  depth: number
  closed: Set<string>
  forcedOpen: Set<string>
  activePath: string | null
  onToggle: (path: string) => void
  onOpen: (path: string) => void
}

function Nodes({ nodes, depth, ...rest }: NodesProps) {
  return (
    <>
      {nodes.map((n) => {
        const indent = { paddingLeft: 16 + depth * 16 }
        if (n.kind === 'file') {
          const active = n.path === rest.activePath
          return (
            <li key={n.path} role="none">
              <button
                type="button"
                role="treeitem"
                aria-selected={active}
                className={`${styles.item} ${active ? styles.active : ''}`}
                style={indent}
                title={`${n.path} · ${n.info.line_count} lines`}
                onClick={() => rest.onOpen(n.path)}
              >
                {n.name}
              </button>
            </li>
          )
        }
        // Với thư mục đã gộp chuỗi (src/pkg), cần kiểm tra mọi cấp thành phần của nó.
        const open = !rest.closed.has(n.path) || isForced(n.path, rest.forcedOpen)
        return (
          <li key={n.path} role="none">
            <button
              type="button"
              role="treeitem"
              aria-expanded={open}
              className={styles.item}
              style={indent}
              onClick={() => rest.onToggle(n.path)}
            >
              <span aria-hidden="true" className={styles.caret}>
                {open ? '▾' : '▸'}
              </span>
              {n.name}
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

function isForced(dirPath: string, forced: Set<string>): boolean {
  return forced.has(dirPath)
}
