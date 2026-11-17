/** Huy hiệu nhỏ cho từng loại file, để nhìn là biết file Python hay Markdown giống trong VS Code.
 *  Màu dịu và chỉ có vài tông, vì cả giao diện đã chủ ý gần như đơn sắc. */

export type Badge = { label: string; bg: string; fg: string }

const GREY: Omit<Badge, 'label'> = { bg: '#1e1e22', fg: '#a1a1aa' }
const BLUE: Omit<Badge, 'label'> = { bg: '#16212e', fg: '#6fa8dc' }
const YELLOW: Omit<Badge, 'label'> = { bg: '#2a2616', fg: '#e5c07b' }
const RED: Omit<Badge, 'label'> = { bg: '#2a1a16', fg: '#e8896b' }
const GREEN: Omit<Badge, 'label'> = { bg: '#17231a', fg: '#98c379' }

const BY_EXTENSION: Record<string, Badge> = {
  py: { label: 'PY', ...BLUE },
  js: { label: 'JS', ...YELLOW },
  jsx: { label: 'JSX', ...YELLOW },
  mjs: { label: 'JS', ...YELLOW },
  ts: { label: 'TS', ...BLUE },
  tsx: { label: 'TSX', ...BLUE },
  json: { label: '{}', ...YELLOW },
  md: { label: 'MD', ...GREY },
  rst: { label: 'RST', ...GREY },
  txt: { label: 'TXT', ...GREY },
  yml: { label: 'YML', ...RED },
  yaml: { label: 'YML', ...RED },
  toml: { label: 'TML', ...GREY },
  sh: { label: 'SH', ...GREEN },
  go: { label: 'GO', ...BLUE },
  rs: { label: 'RS', ...RED },
  java: { label: 'JV', ...RED },
  rb: { label: 'RB', ...RED },
  php: { label: 'PHP', ...BLUE },
  c: { label: 'C', ...BLUE },
  h: { label: 'H', ...BLUE },
  cpp: { label: 'C++', ...BLUE },
  cs: { label: 'C#', ...GREEN },
  html: { label: 'HTM', ...RED },
  css: { label: 'CSS', ...BLUE },
  scss: { label: 'CSS', ...BLUE },
  sql: { label: 'SQL', ...YELLOW },
  vue: { label: 'VUE', ...GREEN },
  svelte: { label: 'SVL', ...RED },
}

const BY_NAME: Record<string, Badge> = {
  Dockerfile: { label: 'DKR', ...BLUE },
  Makefile: { label: 'MK', ...GREY },
}

export function fileBadge(fileName: string): Badge {
  if (fileName in BY_NAME) return BY_NAME[fileName]
  const dot = fileName.lastIndexOf('.')
  // file bắt đầu bằng dấu chấm (.gitignore) thì không có "đuôi"
  const ext = dot > 0 ? fileName.slice(dot + 1).toLowerCase() : ''
  return BY_EXTENSION[ext] ?? { label: ext ? ext.slice(0, 3).toUpperCase() : 'TXT', ...GREY }
}
