type Props = {
  value: string
  className?: string
  iconClassName?: string
}

export default function SalaryText({ value, className, iconClassName = 'w-3.5 h-3.5' }: Props) {
  const parts = value.split('﷼')
  if (parts.length === 1) return <span className={className}>{value}</span>
  return (
    <span className={`inline-flex items-center gap-1 ${className ?? ''}`}>
      {parts.map((part, i) => (
        <span key={i} className="inline-flex items-center gap-1">
          {part}
          {i < parts.length - 1 && (
            <img src="/logos/riyal.svg" alt="SAR" className={`inline-block ${iconClassName}`} />
          )}
        </span>
      ))}
    </span>
  )
}
