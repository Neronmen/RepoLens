// Cảnh 3D của hero: một đồ thị các "file" và đường đi của agent sáng lên dần.
// File này import `three` tĩnh, nhưng chỉ được nạp bằng import() động từ GraphScene,
// nên three nằm ở chunk riêng và không chặn việc hiện chữ của trang.
import {
  BufferGeometry,
  Color,
  DoubleSide,
  DynamicDrawUsage,
  Float32BufferAttribute,
  Fog,
  Group,
  InstancedMesh,
  Line,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PerspectiveCamera,
  RingGeometry,
  Scene,
  SphereGeometry,
  Vector3,
  WebGLRenderer,
} from 'three'

export interface GraphOptions {
  reduceMotion: boolean
  ariaLabel: string
  labelClass: string
  onFail?: () => void
}

// Số ngẫu nhiên có hạt giống: cảnh luôn giống nhau mỗi lần tải, không "nhảy" giữa các lần render.
function mulberry32(seed: number) {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2)
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3)

// Nhịp của một vòng: đi từng đoạn, dừng giữ nguyên cho người xem đọc, mờ dần rồi lặp lại.
const SEG = 1.15 // thời gian cho mỗi đoạn (đi + dừng ở node)
const TRAVEL = 0.8 // phần "đi" trong mỗi đoạn
const HOLD = 2.4
const FADE = 0.9

function buildLayout() {
  const rand = mulberry32(7)
  const radii = new Vector3(2.9, 2.5, 2.1)
  const pts: Vector3[] = []
  // Rải điểm trong một khối elip, loại các điểm quá sát nhau để đồ thị thoáng.
  for (let tries = 0; pts.length < 30 && tries < 4000; tries++) {
    const p = new Vector3(rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1)
    if (p.lengthSq() > 1) continue
    p.multiply(radii)
    if (pts.every((q) => q.distanceTo(p) > 0.95)) pts.push(p)
  }

  // Mỗi node nối với 2 node gần nhất: ra một mạng lưới trông tự nhiên.
  const edges = new Set<string>()
  const key = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`)
  pts.forEach((p, i) => {
    pts
      .map((q, j) => ({ j, d: i === j ? Infinity : p.distanceTo(q) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, 2)
      .forEach(({ j }) => edges.add(key(i, j)))
  })

  // Đường đi của agent: từ node bên trái, đi dần sang phải, mỗi bước chọn node chưa qua
  // vừa tầm với và hướng về phía trước. Các đoạn của nó cũng được thêm vào đồ thị.
  let cur = pts.reduce((best, p, i) => (p.x < pts[best].x ? i : best), 0)
  const path = [cur]
  const dir = new Vector3(1, -0.25, 0.1)
  while (path.length < 7) {
    let best = -1
    let bestScore = -Infinity
    pts.forEach((q, j) => {
      if (path.includes(j)) return
      const d = pts[cur].distanceTo(q)
      if (d > 2.7) return
      const score = q.clone().sub(pts[cur]).dot(dir) - d * 0.35
      if (score > bestScore) {
        bestScore = score
        best = j
      }
    })
    if (best < 0) break
    edges.add(key(cur, best))
    path.push(best)
    cur = best
  }

  const edgeList = [...edges].map((k) => k.split('-').map(Number) as [number, number])
  return { pts, edgeList, path, rand }
}

export function createGraphScene(host: HTMLElement, opts: GraphOptions): () => void {
  // Tạo renderer đầu tiên: nếu không có WebGL thì ném lỗi ngay, chưa có gì cần dọn.
  const renderer = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' })
  const canvas = renderer.domElement
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
  renderer.setClearColor(0x000000, 0)

  // Lấy màu từ token CSS để cảnh luôn khớp với phần còn lại của trang.
  const css = getComputedStyle(document.documentElement)
  const token = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback
  const accent = new Color(token('--accent', '#b6f23a'))
  const bg = new Color(token('--bg', '#0a0a0b'))
  const edgeColor = new Color(token('--border-strong', '#2a2a2f'))
  const nodeColor = new Color(token('--faint', '#8a8a93')).multiplyScalar(0.42)

  const { pts, edgeList, path, rand } = buildLayout()
  const P = path.length

  const scene = new Scene()
  scene.fog = new Fog(bg, 8, 13) // xa thì chìm dần vào nền, cho cảm giác chiều sâu
  const camera = new PerspectiveCamera(38, 1, 0.1, 50)
  camera.position.set(0, 0, 8.4)
  const world = new Group()
  world.rotation.x = 0.22
  scene.add(world)

  const disposables: { dispose(): void }[] = [renderer]
  const track = <T extends { dispose(): void }>(d: T) => {
    disposables.push(d)
    return d
  }

  // Các node xám: một InstancedMesh duy nhất = một draw call.
  const sphere = track(new SphereGeometry(1, 14, 10))
  const nodes = new InstancedMesh(sphere, track(new MeshBasicMaterial({ color: nodeColor })), pts.length)
  const dummy = new Object3D()
  const radius = pts.map(() => 0.07 + rand() * 0.07)
  pts.forEach((p, i) => {
    dummy.position.copy(p)
    dummy.scale.setScalar(radius[i])
    dummy.updateMatrix()
    nodes.setMatrixAt(i, dummy.matrix)
  })
  world.add(nodes)

  // Các đường nối xám: một LineSegments.
  const edgePos: number[] = []
  edgeList.forEach(([a, b]) => edgePos.push(pts[a].x, pts[a].y, pts[a].z, pts[b].x, pts[b].y, pts[b].z))
  const edgeGeo = track(new BufferGeometry())
  edgeGeo.setAttribute('position', new Float32BufferAttribute(edgePos, 3))
  world.add(new LineSegments(edgeGeo, track(new LineBasicMaterial({ color: edgeColor, transparent: true, opacity: 0.85 }))))

  // Đường đi của agent: một Line, mỗi frame chỉ đổi đỉnh "đầu" và drawRange.
  const pathPts = path.map((i) => pts[i])
  const pathGeo = track(new BufferGeometry())
  const pathAttr = new Float32BufferAttribute(pathPts.flatMap((p) => [p.x, p.y, p.z]), 3)
  pathAttr.setUsage(DynamicDrawUsage)
  pathGeo.setAttribute('position', pathAttr)
  const pathMat = track(new LineBasicMaterial({ color: accent, transparent: true, fog: false }))
  const pathLine = new Line(pathGeo, pathMat)
  world.add(pathLine)

  // Node của đường đi: phóng to dần khi agent tới nơi.
  const pathNodeMat = track(new MeshBasicMaterial({ color: accent, transparent: true, fog: false }))
  const pathNodes = new InstancedMesh(sphere, pathNodeMat, P)
  pathNodes.instanceMatrix.setUsage(DynamicDrawUsage)
  world.add(pathNodes)

  // "Đầu" của agent chạy dọc đường đi, và vòng sáng nhẹ luôn quay mặt về camera.
  const agent = new Mesh(sphere, pathNodeMat)
  agent.scale.setScalar(0.07)
  world.add(agent)
  const haloMat = track(new MeshBasicMaterial({ color: accent, transparent: true, fog: false, side: DoubleSide }))
  const haloGeo = track(new RingGeometry(0.92, 1, 48))
  const halo = new Mesh(haloGeo, haloMat)
  scene.add(halo)

  // Nhãn chữ HTML đè lên canvas, định vị bằng cách chiếu toạ độ 3D sang 2D.
  const labelDefs = [
    { at: 1, text: 'search_code' },
    { at: Math.min(3, P - 1), text: 'read_file' },
    { at: P - 1, text: 'signer.py:227' },
  ]
  const labels = labelDefs.map((d) => {
    const el = document.createElement('span')
    el.className = opts.labelClass
    el.textContent = d.text
    el.setAttribute('aria-hidden', 'true')
    host.appendChild(el)
    return { ...d, el }
  })

  canvas.setAttribute('role', 'img')
  canvas.setAttribute('aria-label', opts.ariaLabel)
  Object.assign(canvas.style, { display: 'block', width: '100%', height: '100%', opacity: '0', transition: 'opacity 0.7s ease' })
  host.appendChild(canvas)

  const moveEnd = (P - 1) * SEG
  const cycle = moveEnd + HOLD + FADE
  const tmp = new Vector3()
  let width = 1
  let height = 1

  // Đặt toàn bộ trạng thái của đường đi tại thời điểm tt trong vòng lặp.
  function applyPath(tt: number) {
    const tm = Math.min(tt, moveEnd)
    const s = Math.min(Math.floor(tm / SEG), P - 2)
    const f = easeInOut(clamp01((tm - s * SEG) / TRAVEL))
    const head = pathPts[s].clone().lerp(pathPts[s + 1], f)
    pathAttr.setXYZ(s + 1, head.x, head.y, head.z)
    pathAttr.needsUpdate = true
    pathGeo.setDrawRange(0, s + 2)
    agent.position.copy(head)

    const alpha = tt < moveEnd + HOLD ? 1 : 1 - clamp01((tt - moveEnd - HOLD) / FADE)
    pathMat.opacity = alpha
    pathNodeMat.opacity = alpha

    const appear = (j: number) => clamp01((tt - (j === 0 ? 0 : (j - 1) * SEG + TRAVEL)) / (j === 0 ? 0.3 : 0.35))
    for (let j = 0; j < P; j++) {
      dummy.position.copy(pathPts[j])
      dummy.scale.setScalar((radius[path[j]] + 0.05) * easeOut(appear(j)))
      dummy.updateMatrix()
      pathNodes.setMatrixAt(j, dummy.matrix)
    }
    pathNodes.instanceMatrix.needsUpdate = true

    // Vòng sáng đi theo đầu agent và "thở" nhẹ.
    world.updateMatrixWorld()
    halo.position.copy(world.localToWorld(tmp.copy(head)))
    halo.quaternion.copy(camera.quaternion)
    const pulse = tt < moveEnd ? 0 : (tt - moveEnd) * 2.2
    halo.scale.setScalar(0.3 + 0.05 * Math.sin(pulse * 2))
    haloMat.opacity = 0.4 * alpha

    for (const l of labels) {
      const a = appear(l.at) * alpha
      l.el.style.opacity = String(a)
      tmp.copy(pathPts[l.at])
      world.localToWorld(tmp).project(camera)
      const x = (tmp.x * 0.5 + 0.5) * width
      const y = (-tmp.y * 0.5 + 0.5) * height
      // Gần mép phải thì đặt nhãn sang bên trái node để khỏi bị cắt.
      const flip = x > width - 110
      l.el.style.transform = `translate(${flip ? `calc(${x - 12}px - 100%)` : `${x + 12}px`}, ${y - 9}px)`
    }
  }

  const BASE_Y = 0.45
  const STATIC_T = moveEnd + 0.01 // khung hình tĩnh: đường đi đã sáng đủ
  let spin = 0
  let curX = 0
  let curY = 0
  let targetX = 0
  let targetY = 0
  let clock = 0

  function draw() {
    world.rotation.y = BASE_Y + spin + curY
    world.rotation.x = 0.22 + curX
    camera.updateMatrixWorld()
    applyPath(opts.reduceMotion ? STATIC_T : clock % cycle)
    renderer.render(scene, camera)
  }

  function onPointer(e: PointerEvent) {
    if (e.pointerType !== 'mouse') return // cảm ứng thì chỉ tự xoay
    targetY = (e.clientX / window.innerWidth - 0.5) * 0.7
    targetX = (e.clientY / window.innerHeight - 0.5) * 0.4
  }

  let raf = 0
  let running = false
  let last = 0
  let onScreen = true

  function frame(now: number) {
    raf = requestAnimationFrame(frame)
    // Mốc `now` của rAF có thể nhỏ hơn performance.now() lúc bắt đầu: kẹp lại để dt không âm.
    const dt = Math.min(Math.max((now - last) / 1000, 0), 0.1)
    last = now
    clock += dt
    spin += dt * 0.12
    const k = 1 - Math.exp(-dt * 4) // làm mượt parallax, không phụ thuộc tốc độ khung hình
    curX += (targetX - curX) * k
    curY += (targetY - curY) * k
    draw()
  }

  // Chỉ chạy vòng lặp khi canvas đang thấy được và tab đang mở.
  function sync() {
    const should = !opts.reduceMotion && onScreen && !document.hidden
    if (should && !running) {
      running = true
      last = performance.now()
      raf = requestAnimationFrame(frame)
    } else if (!should && running) {
      running = false
      cancelAnimationFrame(raf)
    }
  }

  const resize = new ResizeObserver(() => {
    width = host.clientWidth
    height = host.clientHeight
    if (!width || !height) return
    renderer.setSize(width, height, false)
    camera.aspect = width / height
    camera.updateProjectionMatrix()
    draw() // setSize xoá canvas, vẽ lại ngay để không bị nháy trắng
  })
  const io = new IntersectionObserver((entries) => {
    onScreen = entries[entries.length - 1].isIntersecting
    sync()
  })
  const onLost = (e: Event) => {
    e.preventDefault()
    opts.onFail?.()
  }

  resize.observe(host)
  io.observe(host)
  document.addEventListener('visibilitychange', sync)
  canvas.addEventListener('webglcontextlost', onLost)
  if (!opts.reduceMotion) window.addEventListener('pointermove', onPointer, { passive: true })
  draw()
  canvas.style.opacity = '1'
  sync()

  return () => {
    cancelAnimationFrame(raf)
    running = false
    resize.disconnect()
    io.disconnect()
    document.removeEventListener('visibilitychange', sync)
    window.removeEventListener('pointermove', onPointer)
    canvas.removeEventListener('webglcontextlost', onLost)
    nodes.dispose()
    pathNodes.dispose()
    disposables.forEach((d) => d.dispose())
    renderer.forceContextLoss() // trả context WebGL lại cho trình duyệt (dev StrictMode mount hai lần)
    canvas.remove()
    labels.forEach((l) => l.el.remove())
  }
}
