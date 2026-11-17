import en from './en'
import vi from './vi'
import type { Lang } from './store'

export type MessageKey = keyof typeof en
export type Params = Record<string, string | number>

// vi không có các khóa `.one`, nên coi nó như từ điển lỏng hơn; khóa thiếu sẽ rơi về tiếng Anh.
const dictionaries: Record<Lang, Partial<Record<MessageKey, string>> & Record<MessageKey, string>> = {
  en,
  vi: vi as Record<MessageKey, string>,
}

/** Thay `{tên}` bằng giá trị tương ứng. Thiếu tham số thì giữ nguyên `{tên}` để lỗi lộ ra, không im lặng. */
function fill(text: string, params?: Params): string {
  if (!params) return text
  return text.replace(/\{(\w+)\}/g, (whole, name: string) => (name in params ? String(params[name]) : whole))
}

export function translate(lang: Lang, key: MessageKey, params?: Params): string {
  return fill(dictionaries[lang][key] ?? dictionaries.en[key] ?? key, params)
}

/** Số ít / số nhiều. Khóa viết dạng `chat.steps.one` / `chat.steps.other`; tiếng Việt chỉ cần `.other`. */
export function translatePlural(lang: Lang, key: string, count: number, params?: Params): string {
  const category = new Intl.PluralRules(lang).select(count)
  const dict = dictionaries[lang] as Record<string, string>
  const text = dict[`${key}.${category}`] ?? dict[`${key}.other`] ?? key
  return fill(text, { n: count, ...params })
}
