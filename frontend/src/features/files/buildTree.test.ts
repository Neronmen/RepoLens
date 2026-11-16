import { describe, expect, it } from 'vitest'
import { buildTree, collapseChains, parentDirs } from './buildTree'

const f = (path: string) => ({ path, language: 'python', line_count: 10 })

describe('buildTree', () => {
  it('dựng cây, thư mục trước file, mỗi nhóm theo chữ cái', () => {
    const tree = buildTree([f('z.py'), f('src/b.py'), f('README.md'), f('src/a.py'), f('docs/x.md')])
    expect(tree.map((n) => `${n.kind}:${n.name}`)).toEqual(['dir:docs', 'dir:src', 'file:README.md', 'file:z.py'])
    const src = tree[1]
    expect(src.kind === 'dir' && src.children.map((c) => c.name)).toEqual(['a.py', 'b.py'])
  })

  it('đường dẫn đầy đủ được giữ ở từng nút', () => {
    const [dir] = buildTree([f('a/b/c.py')])
    expect(dir.path).toBe('a')
    if (dir.kind === 'dir') {
      expect(dir.children[0].path).toBe('a/b')
    }
  })

  it('danh sách rỗng ra cây rỗng', () => {
    expect(buildTree([])).toEqual([])
  })
})

describe('collapseChains', () => {
  it('gộp chuỗi thư mục chỉ có một con', () => {
    const [n] = collapseChains(buildTree([f('src/pkg/a.py'), f('src/pkg/b.py')]))
    expect(n.name).toBe('src/pkg')
    expect(n.path).toBe('src/pkg')
  })

  it('không gộp khi thư mục có nhiều con', () => {
    const [n] = collapseChains(buildTree([f('src/a.py'), f('src/pkg/b.py')]))
    expect(n.name).toBe('src')
  })
})

describe('parentDirs', () => {
  it('liệt kê các thư mục cha từ ngoài vào trong', () => {
    expect(parentDirs('a/b/c.py')).toEqual(['a', 'a/b'])
    expect(parentDirs('README.md')).toEqual([])
  })
})
