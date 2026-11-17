import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { getLang, translate } from '../../i18n'
import { api, ApiError, type SavedTurn } from '../../lib/api'
import { streamAsk } from '../../lib/sse'
import { getToken } from '../../lib/token'
import { waitForOnline } from '../../lib/useOnline'
import { buildHistory, newTurn, turnsReducer, type Turn } from './turns'

/** Một cuộc trò chuyện đã lưu ở server, dùng để khôi phục khi mở lại. */
export type SavedConversation = { id: string; turns: SavedTurn[] }

type RepoRef = { id: number; owner: string; name: string }

// Tối đa mấy lần tự thử lại khi chưa nhận được gì từ server (mất mạng, server đang thức dậy)
const AUTO_RETRIES = 2
const TRANSIENT = new Set([0, 502, 503, 504])

const localKey = (r: RepoRef) => `repolens.chat.v1.${r.owner}/${r.name}`

function fromSaved(items: SavedTurn[]): Turn[] {
  return items.map((s, i) => ({
    ...newTurn(i + 1, s.question),
    status: s.status,
    notes: s.notes ?? [],
    steps: (s.steps ?? []).map((st) => ({ ...st, status: 'done' as const })),
    answer: s.answer ?? '',
    citations: s.citations ?? [],
    usage: s.usage ?? null,
    error: s.error ?? null,
  }))
}

/** Khách chưa đăng nhập: giữ hội thoại trong trình duyệt để F5 không mất. */
function loadLocal(r: RepoRef): Turn[] {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(localKey(r)) ?? '[]')
    return Array.isArray(raw) ? fromSaved(raw as SavedTurn[]) : []
  } catch {
    return []
  }
}

function saveLocal(r: RepoRef, turns: Turn[]) {
  try {
    const items: SavedTurn[] = turns
      .filter((t) => t.status !== 'streaming')
      .slice(-20)
      .map((t) => ({
        question: t.question,
        status: t.status as SavedTurn['status'],
        notes: t.notes,
        // bỏ phần xem trước kết quả công cụ cho nhẹ, vì nó khá dài
        steps: t.steps.map((s) => ({ ...s, preview: undefined })),
        answer: t.answer,
        citations: t.citations,
        usage: t.usage,
        error: t.error,
      }))
    localStorage.setItem(localKey(r), JSON.stringify(items))
  } catch {
    // đầy bộ nhớ hoặc bị chặn: bỏ qua, chỉ mất tính năng nhớ lại
  }
}

/** Hỏi agent và theo dõi các lượt hỏi đáp của một repo. */
export function useAsk(repo: RepoRef, saved?: SavedConversation) {
  const [turns, dispatch] = useReducer(
    turnsReducer,
    undefined,
    () => (saved ? fromSaved(saved.turns) : getToken() ? [] : loadLocal(repo)),
  )
  const [reconnecting, setReconnecting] = useState(false)
  const latest = useRef(turns)
  const current = useRef<AbortController | null>(null)
  const nextId = useRef(turns.length + 1)
  const conversationId = useRef<string | null>(saved?.id ?? null)

  useEffect(() => {
    latest.current = turns
    // khách thì lưu ở trình duyệt; người đã đăng nhập thì server tự lưu
    if (!conversationId.current && !getToken() && turns.at(-1)?.status !== 'streaming') saveLocal(repo, turns)
  }, [turns, repo])

  // rời trang giữa chừng thì ngắt luôn cuộc gọi, đừng để server tiếp tục tốn lượt của model
  useEffect(() => () => current.current?.abort(), [])

  const busy = turns.at(-1)?.status === 'streaming'

  const ask = useCallback(
    async (question: string) => {
      const text = question.trim()
      if (!text || latest.current.at(-1)?.status === 'streaming') return

      const id = nextId.current++
      const ctrl = new AbortController()
      current.current = ctrl
      const history = buildHistory(latest.current)
      dispatch({ type: 'ask', id, question: text })

      // Đã đăng nhập thì mở một cuộc trò chuyện ở server ngay trước câu hỏi đầu tiên.
      // Nếu việc đó lỗi thì vẫn hỏi bình thường, chỉ là lần này không được lưu.
      if (getToken() && !conversationId.current) {
        try {
          const conv = await api.createConversation(`${repo.owner}/${repo.name}`)
          conversationId.current = conv.id
          // F5 ở địa chỉ này sẽ mở lại đúng cuộc trò chuyện (không dùng navigate để khỏi dựng lại cả trang)
          window.history.replaceState(null, '', `/c/${conv.id}`)
        } catch {
          // bỏ qua
        }
      }

      for (let attempt = 0; ; attempt++) {
        let gotEvent = false
        let finished = false
        try {
          await streamAsk(
            repo.id,
            { question: text, history, conversation_id: conversationId.current ?? undefined },
            (event) => {
              gotEvent = true
              setReconnecting(false)
              if (event.type === 'done') finished = true
              dispatch({ type: 'event', id, event })
            },
            ctrl.signal,
          )
          if (ctrl.signal.aborted) return
          // luồng đóng mà không có "done" nghĩa là kết nối đứt giữa chừng
          if (!finished) throw new ApiError(0, translate(getLang(), 'error.cut'))
          return
        } catch (e) {
          if (ctrl.signal.aborted) return
          const status = e instanceof ApiError ? e.status : 0
          // Chưa nhận được gì thì thử lại là an toàn (server chưa làm gì, cũng chưa lưu gì).
          // Đã nhận một phần thì không tự hỏi lại, vì sẽ tốn thêm lượt và lưu trùng; để người dùng bấm Thử lại.
          if (!gotEvent && TRANSIENT.has(status) && attempt < AUTO_RETRIES) {
            setReconnecting(true)
            await waitForOnline(ctrl.signal)
            await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)))
            if (ctrl.signal.aborted) return
            continue
          }
          setReconnecting(false)
          dispatch({ type: 'fail', id, message: e instanceof Error ? e.message : translate(getLang(), 'error.generic') })
          return
        }
      }
    },
    [repo],
  )

  const stop = useCallback(() => {
    const last = latest.current.at(-1)
    if (!last || last.status !== 'streaming') return
    current.current?.abort()
    setReconnecting(false)
    dispatch({ type: 'stop', id: last.id })
  }, [])

  return { turns, busy, reconnecting, ask, stop }
}
