const TONE_TEXT = {
  default: 'text-gray-800',
  brand: 'text-brand',
  green: 'text-green-600',
  red: 'text-red-600',
  amber: 'text-amber-600',
}

export default function StatMiniCard({ label, value, tone = 'default' }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm p-5 text-center">
      <p className={`text-xl font-black ${TONE_TEXT[tone] || TONE_TEXT.default}`}>{value}</p>
      <p className="text-xs text-gray-500 mt-1">{label}</p>
    </div>
  )
}
