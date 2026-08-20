export function scoreBg(score: number): string {
  if (score >= 85) return 'bg-green-500'
  if (score >= 70) return 'bg-teal'
  if (score >= 55) return 'bg-yellow-500'
  return 'bg-orange-500'
}

export function scoreText(score: number): string {
  if (score >= 85) return 'text-green-600'
  if (score >= 70) return 'text-teal-deep'
  if (score >= 55) return 'text-yellow-600'
  return 'text-orange-600'
}

export function scoreStroke(score: number): string {
  return scoreBg(score).replace('bg-', 'stroke-')
}
