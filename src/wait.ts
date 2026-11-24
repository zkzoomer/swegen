// Bound each bridge wait so the caller can keep reporting progress.
export function waitSeconds(value = '45'): number {
  const seconds = Number(value)
  if (!Number.isFinite(seconds) || seconds < 0 || seconds > 55) throw new Error('Wait timeout must be between 0 and 55 seconds')
  return seconds
}
export async function waitFor<T>(read: () => Promise<T>, finished: (state: T) => boolean, seconds: number): Promise<T> {
  const deadline = Date.now() + seconds * 1000
  while (true) {
    const state = await read()
    if (finished(state) || Date.now() >= deadline) return state
    await new Promise(resolve => setTimeout(resolve, Math.min(1000, Math.max(0, deadline - Date.now()))))
  }
}
