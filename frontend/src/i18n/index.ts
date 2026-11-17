import { useCallback, useSyncExternalStore } from 'react'
import { getLang, setLang, subscribe, type Lang } from './store'
import { translate, translatePlural, type MessageKey, type Params } from './translate'

export { getLang, setLang, type Lang } from './store'
export { translate, type MessageKey } from './translate'

/** Dùng trong component: `const { t } = useI18n()`. Đổi ngôn ngữ thì mọi component đang dùng tự vẽ lại. */
export function useI18n() {
  const lang = useSyncExternalStore(subscribe, getLang, () => 'en' as Lang)
  const t = useCallback((key: MessageKey, params?: Params) => translate(lang, key, params), [lang])
  const tp = useCallback(
    (key: string, count: number, params?: Params) => translatePlural(lang, key, count, params),
    [lang],
  )
  return { lang, t, tp, setLang }
}
