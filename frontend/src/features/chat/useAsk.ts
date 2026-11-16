import { useCallback, useEffect, useReducer, useRef } from 'react'
import { streamAsk } from '../../lib/sse'
import { buildHistory, turnsReducer, type Turn } from './turns'

/** Hỏi agent và theo dõi các lượt hỏi đáp của một repo. */
export function useAsk(repoId: number) {
  const [turns, dispatch] = useReducer(turnsReducer, [] as Turn[])
  const latest = useRef(turns)
  const current = useRef<AbortController | null>(null)
  const nextId = useRef(1)

  useEffect(() => {
    latest.current = turns
  }, [turns])

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
      dispatch({ type: 'ask', id, question: text })

      let finished = false
      try {
        await streamAsk(
          repoId,
          { question: text, history: buildHistory(latest.current) },
          (event) => {
            if (event.type === 'done') finished = true
            dispatch({ type: 'event', id, event })
          },
          ctrl.signal,
        )
        // luồng đóng mà không có "done" nghĩa là kết nối đứt giữa chừng
        if (!finished && !ctrl.signal.aborted) {
          dispatch({ type: 'fail', id, message: 'Kết nối bị ngắt giữa chừng, thử lại nhé.' })
        }
      } catch (e) {
        dispatch({ type: 'fail', id, message: e instanceof Error ? e.message : 'Có lỗi xảy ra, thử lại sau nhé.' })
      }
    },
    [repoId],
  )

  const stop = useCallback(() => {
    const last = latest.current.at(-1)
    if (!last || last.status !== 'streaming') return
    current.current?.abort()
    dispatch({ type: 'stop', id: last.id })
  }, [])

  return { turns, busy, ask, stop }
}
