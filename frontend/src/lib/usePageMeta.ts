import { useEffect } from 'react'

/** Đặt tiêu đề tab và báo công cụ tìm kiếm có nên lập chỉ mục trang này không. */
export function usePageMeta(title: string | null, indexable: boolean) {
  useEffect(() => {
    const prevTitle = document.title
    if (title) document.title = title
    let tag = document.querySelector<HTMLMetaElement>('meta[name="robots"]')
    const prevRobots = tag?.content ?? 'index, follow'
    if (!tag) {
      tag = document.createElement('meta')
      tag.name = 'robots'
      document.head.appendChild(tag)
    }
    tag.content = indexable ? 'index, follow' : 'noindex, nofollow'
    return () => {
      document.title = prevTitle
      if (tag) tag.content = prevRobots
    }
  }, [title, indexable])
}
