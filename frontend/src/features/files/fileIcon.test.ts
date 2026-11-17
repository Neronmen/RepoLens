import { describe, expect, it } from 'vitest'
import { filterTree, buildTree } from './buildTree'
import { fileBadge } from './fileIcon'

describe('fileBadge', () => {
  it('nhận đúng loại file phổ biến', () => {
    expect(fileBadge('signer.py').label).toBe('PY')
    expect(fileBadge('README.md').label).toBe('MD')
    expect(fileBadge('config.yml').label).toBe('YML')
    expect(fileBadge('config.yaml').label).toBe('YML')
    expect(fileBadge('package.json').label).toBe('{}')
  })

  it('không phân biệt hoa thường ở đuôi file', () => {
    expect(fileBadge('LOGO.PY').label).toBe('PY')
  })

  it('nhận theo tên file đặc biệt', () => {
    expect(fileBadge('Dockerfile').label).toBe('DKR')
    expect(fileBadge('Makefile').label).toBe('MK')
  })

  it('file ẩn không có đuôi và đuôi lạ đều có huy hiệu hợp lý', () => {
    expect(fileBadge('.gitignore').label).toBe('TXT')
    expect(fileBadge('LICENSE').label).toBe('TXT')
    expect(fileBadge('data.parquet').label).toBe('PAR')
    expect(fileBadge('a.b.py').label).toBe('PY') // chỉ tính đuôi cuối cùng
  })
})

const f = (path: string) => ({ path, language: 'x', line_count: 1 })

describe('filterTree', () => {
  const tree = buildTree([f('src/pkg/signer.py'), f('src/pkg/timed.py'), f('docs/signer.md'), f('README.md')])

  it('chỉ giữ file khớp cùng các thư mục cha của chúng', () => {
    const out = filterTree(tree, 'signer')
    const names = (n: (typeof tree)[number]): string[] =>
      n.kind === 'file' ? [n.path] : n.children.flatMap(names)
    expect(out.flatMap(names).sort()).toEqual(['docs/signer.md', 'src/pkg/signer.py'])
    expect(out.map((n) => n.name).sort()).toEqual(['docs', 'src'])
  })

  it('không phân biệt hoa thường và bỏ khoảng trắng hai đầu', () => {
    expect(filterTree(tree, '  SIGNER ').length).toBe(2)
  })

  it('ô lọc rỗng thì giữ nguyên cả cây, không khớp gì thì ra rỗng', () => {
    expect(filterTree(tree, '')).toBe(tree)
    expect(filterTree(tree, 'khong-co-file-nay')).toEqual([])
  })

  it('khớp theo cả đường dẫn thư mục, không chỉ tên file', () => {
    const out = filterTree(tree, 'src/pkg')
    expect(out.length).toBe(1)
  })
})
