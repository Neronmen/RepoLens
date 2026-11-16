import type { FileInfo } from '../../lib/api'

export type TreeNode =
  | { kind: 'dir'; name: string; path: string; children: TreeNode[] }
  | { kind: 'file'; name: string; path: string; info: FileInfo }

/** Từ danh sách đường dẫn phẳng ("src/a/b.py") dựng thành cây thư mục.
 *  Thư mục xếp trước file, mỗi nhóm theo thứ tự chữ cái. */
export function buildTree(files: FileInfo[]): TreeNode[] {
  const root: TreeNode[] = []

  for (const info of files) {
    const parts = info.path.split('/')
    let level = root
    let prefix = ''
    parts.forEach((name, i) => {
      prefix = prefix ? `${prefix}/${name}` : name
      if (i === parts.length - 1) {
        level.push({ kind: 'file', name, path: info.path, info })
        return
      }
      let dir = level.find((n): n is Extract<TreeNode, { kind: 'dir' }> => n.kind === 'dir' && n.name === name)
      if (!dir) {
        dir = { kind: 'dir', name, path: prefix, children: [] }
        level.push(dir)
      }
      level = dir.children
    })
  }

  sortLevel(root)
  return root
}

function sortLevel(nodes: TreeNode[]) {
  nodes.sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'dir' ? -1 : 1))
  for (const n of nodes) if (n.kind === 'dir') sortLevel(n.children)
}

/** Các thư mục cha của một file, để mở sẵn cây tới đúng file được trích dẫn. */
export function parentDirs(path: string): string[] {
  const parts = path.split('/').slice(0, -1)
  return parts.map((_, i) => parts.slice(0, i + 1).join('/'))
}

/** Thư mục chỉ có một thư mục con (kiểu `src/itsdangerous`) thì gộp lại cho đỡ phải bấm nhiều lần. */
export function collapseChains(nodes: TreeNode[]): TreeNode[] {
  return nodes.map((n) => {
    if (n.kind === 'file') return n
    let cur = n
    let name = n.name
    while (cur.children.length === 1 && cur.children[0].kind === 'dir') {
      cur = cur.children[0]
      name = `${name}/${cur.name}`
    }
    return { ...cur, name, children: collapseChains(cur.children) }
  })
}
