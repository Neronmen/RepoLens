import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import styles from './Resizer.module.css'

/**
 * Thanh kéo giữa hai khung. `onResize` nhận độ rộng mới tính từ lúc bắt đầu kéo,
 * nên nơi gọi chỉ cần kẹp giá trị, không phải theo dõi con trỏ.
 * `sign`: +1 nếu kéo sang phải làm khung bên TRÁI rộng ra (khung file), -1 nếu làm khung bên PHẢI hẹp lại (khung code).
 */
export default function Resizer({
  label,
  width,
  sign,
  onResize,
  onReset,
}: {
  label: string
  width: number
  sign: 1 | -1
  onResize: (next: number) => void
  onReset: () => void
}) {
  const start = useRef({ x: 0, w: 0 })
  const [dragging, setDragging] = useState(false)

  function down(e: PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    start.current = { x: e.clientX, w: width }
    setDragging(true)
  }
  function move(e: PointerEvent<HTMLDivElement>) {
    if (!dragging) return
    onResize(start.current.w + sign * (e.clientX - start.current.x))
  }
  function up(e: PointerEvent<HTMLDivElement>) {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
    setDragging(false)
  }
  function key(e: KeyboardEvent<HTMLDivElement>) {
    // dùng được bằng bàn phím: mũi tên để chỉnh, Home để về mặc định
    const step = e.shiftKey ? 64 : 16
    if (e.key === 'ArrowLeft') onResize(width - sign * step)
    else if (e.key === 'ArrowRight') onResize(width + sign * step)
    else if (e.key === 'Home') onReset()
    else return
    e.preventDefault()
  }

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={Math.round(width)}
      tabIndex={0}
      className={`${styles.bar} ${dragging ? styles.active : ''}`}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      onDoubleClick={onReset}
      onKeyDown={key}
    />
  )
}
