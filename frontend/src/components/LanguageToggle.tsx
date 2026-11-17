import { useI18n, type Lang } from '../i18n'
import styles from './LanguageToggle.module.css'

const OPTIONS: { lang: Lang; label: string; full: string }[] = [
  { lang: 'en', label: 'EN', full: 'English' },
  { lang: 'vi', label: 'VI', full: 'Tiếng Việt' },
]

/** Công tắc EN | VI. Tên đầy đủ của ngôn ngữ luôn viết bằng chính ngôn ngữ đó để ai cũng nhận ra. */
export default function LanguageToggle() {
  const { lang, setLang, t } = useI18n()
  return (
    <div role="group" aria-label={t('lang.label')} className={styles.toggle}>
      {OPTIONS.map((o) => (
        <button
          key={o.lang}
          type="button"
          lang={o.lang}
          aria-pressed={lang === o.lang}
          aria-label={o.full}
          title={o.full}
          className={lang === o.lang ? styles.on : styles.off}
          onClick={() => setLang(o.lang)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
