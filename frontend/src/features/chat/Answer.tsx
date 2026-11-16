import { Fragment, useMemo } from 'react'
import type { Citation } from '../../lib/sse'
import { parseMarkdown, type Block, type Inline } from './markdown'
import styles from './Answer.module.css'

export type OpenCode = (path: string, start: number, end: number) => void

function basename(path: string): string {
  return path.split('/').pop() ?? path
}

function rangeLabel(start: number, end: number): string {
  return start === end ? `${start}` : `${start}-${end}`
}

/** Một trích dẫn bấm được. Màu cho biết nó đáng tin tới đâu:
 *  xanh = đã kiểm chứng và agent thật sự đã đọc, xám = có thật nhưng agent chưa mở file,
 *  đỏ gạch ngang = file hoặc số dòng không tồn tại. */
export function CitationChip({
  path,
  start,
  end,
  citation,
  onOpen,
}: {
  path: string
  start: number
  end: number
  citation?: Citation
  onOpen: OpenCode
}) {
  // chưa có kết quả kiểm chứng (đang stream) thì coi như chưa biết, hiện trung tính
  const state = !citation ? 'pending' : !citation.valid ? 'invalid' : citation.seen ? 'verified' : 'unread'
  const hint = {
    pending: 'Checking…',
    invalid: 'Could not verify: this file or line range does not exist',
    verified: 'Verified: the agent read this code',
    unread: 'The lines exist, but the agent did not open this file',
  }[state]

  const label = `${basename(path)}:${rangeLabel(start, end)}`
  if (state === 'invalid') {
    return (
      <span className={`${styles.chip} ${styles.invalid}`} title={hint}>
        {label}
      </span>
    )
  }
  return (
    <button
      type="button"
      className={`${styles.chip} ${styles[state]}`}
      title={`${path}:${rangeLabel(start, end)}. ${hint}`}
      onClick={() => onOpen(path, start, end)}
    >
      {label}
    </button>
  )
}

function InlineNodes({
  nodes,
  citations,
  onOpen,
}: {
  nodes: Inline[]
  citations: Citation[]
  onOpen: OpenCode
}) {
  return (
    <>
      {nodes.map((n, i) => {
        switch (n.kind) {
          case 'text':
            return <Fragment key={i}>{n.text}</Fragment>
          case 'code':
            return (
              <code key={i} className={styles.code}>
                {n.text}
              </code>
            )
          case 'bold':
            return (
              <strong key={i}>
                <InlineNodes nodes={n.children} citations={citations} onOpen={onOpen} />
              </strong>
            )
          case 'cite': {
            const c = citations.find((x) => x.path === n.path && x.start_line === n.start && x.end_line === n.end)
            return <CitationChip key={i} path={n.path} start={n.start} end={n.end} citation={c} onOpen={onOpen} />
          }
        }
      })}
    </>
  )
}

function BlockNode({ block, citations, onOpen }: { block: Block; citations: Citation[]; onOpen: OpenCode }) {
  const inline = (nodes: Inline[]) => <InlineNodes nodes={nodes} citations={citations} onOpen={onOpen} />
  switch (block.kind) {
    case 'paragraph':
      return <p>{inline(block.children)}</p>
    case 'heading':
      return <h4 className={styles.heading}>{inline(block.children)}</h4>
    case 'list': {
      const Tag = block.ordered ? 'ol' : 'ul'
      return (
        <Tag className={styles.list}>
          {block.items.map((item, i) => (
            <li key={i}>{inline(item)}</li>
          ))}
        </Tag>
      )
    }
    case 'code':
      return (
        <pre className={styles.pre}>
          <code>{block.text}</code>
        </pre>
      )
  }
}

export default function Answer({
  text,
  citations,
  onOpen,
}: {
  text: string
  citations: Citation[]
  onOpen: OpenCode
}) {
  const blocks = useMemo(() => parseMarkdown(text), [text])
  if (blocks.length === 0) return null

  return (
    <div className={styles.answer}>
      {blocks.map((b, i) => (
        <BlockNode key={i} block={b} citations={citations} onOpen={onOpen} />
      ))}
    </div>
  )
}

/** Hàng "nguồn" dưới câu trả lời: mọi trích dẫn của lượt này và bao nhiêu cái đã được kiểm chứng. */
export function Sources({ citations, onOpen }: { citations: Citation[]; onOpen: OpenCode }) {
  if (citations.length === 0) return null
  const verified = citations.filter((c) => c.valid).length
  return (
    <div className={styles.sources}>
      <div className={styles.chips}>
        {citations.map((c) => (
          <CitationChip
            key={`${c.path}:${c.start_line}-${c.end_line}`}
            path={c.path}
            start={c.start_line}
            end={c.end_line}
            citation={c}
            onOpen={onOpen}
          />
        ))}
      </div>
      <p className={styles.tally}>
        {citations.length} citation{citations.length === 1 ? '' : 's'} · {verified} verified against the index
        {verified < citations.length && (
          <span className={styles.warn}> · {citations.length - verified} could not be verified</span>
        )}
      </p>
    </div>
  )
}
