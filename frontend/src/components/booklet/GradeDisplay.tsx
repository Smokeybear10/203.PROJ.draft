type Props = { score: number; label: string; max?: number }

export default function GradeDisplay({ score, label, max = 100 }: Props) {
  const value = Math.min(max, Math.max(0, Math.round(score)))
  const percent = max > 0 ? value / max * 100 : 0

  return (
    <div className="score-display">
      <div className="score-label-text">{label}</div>
      <div className="score-val">{value}<span> / {max}</span></div>
      <div className="score-bar-track" aria-hidden="true"><div className="score-bar-fill" style={{ width: `${percent}%` }} /></div>
    </div>
  )
}
