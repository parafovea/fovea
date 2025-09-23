export function formatTimestamp(timestamp: number | string | undefined): string {
  if (!timestamp) return 'Unknown date'
  
  const date = new Date(
    typeof timestamp === 'string' 
      ? parseInt(timestamp) * 1000 
      : timestamp * 1000
  )
  
  if (isNaN(date.getTime())) return 'Unknown date'
  
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = Math.floor(seconds % 60)
  
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`
}