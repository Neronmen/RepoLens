// Hình tĩnh dùng khi đang chờ three tải về, hoặc khi máy không có WebGL.
interface Props {
  className?: string
  hidden: boolean
  label: string
}

const GREY_NODES: [number, number, number][] = [
  [90, 120, 7], [330, 140, 9], [130, 250, 8], [240, 360, 10], [130, 400, 6],
  [470, 420, 8], [400, 480, 6], [300, 470, 7], [170, 490, 5], [500, 210, 7],
]
const PATH_NODES: [number, number, number][] = [[200, 90, 9], [250, 230, 11], [380, 330, 11], [450, 100, 9]]

export default function FallbackGraph({ className, hidden, label }: Props) {
  return (
    <svg
      className={className}
      viewBox="0 0 560 560"
      role={hidden ? undefined : 'img'}
      aria-label={hidden ? undefined : label}
      aria-hidden={hidden || undefined}
    >
      <path
        d="M90 120L200 90M200 90L330 140M330 140L450 100M90 120L130 250M130 250L250 230M250 230L330 140M250 230L240 360M240 360L130 400M240 360L380 330M380 330L450 100M380 330L470 420M470 420L400 480M240 360L300 470M300 470L400 480M130 400L170 490M200 90L250 230M450 100L500 210M500 210L380 330"
        fill="none"
        stroke="var(--border-strong)"
      />
      <path d="M200 90L250 230L380 330L450 100" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" />
      {GREY_NODES.map(([x, y, r]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r={r} fill="var(--bg)" stroke="var(--faint)" strokeOpacity="0.5" strokeWidth="1.5" />
      ))}
      {PATH_NODES.map(([x, y, r]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r={r} fill="var(--bg)" stroke="var(--accent)" strokeWidth="2" />
      ))}
      <circle cx="380" cy="330" r="22" fill="none" stroke="var(--accent)" strokeOpacity="0.3" />
      <g fontFamily="var(--font-mono)" fontSize="11" fill="var(--muted)">
        <text x="212" y="82">search_code</text>
        <text x="264" y="226">read_file</text>
        <text x="396" y="350">signer.py:227</text>
      </g>
    </svg>
  )
}
