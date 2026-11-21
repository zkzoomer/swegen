/** Structural ZIP checks only. The Python auditor validates task content. */
export function validateArchiveEntries(entries: string[], dryRun: boolean): void {
  if (!entries.length) throw new Error('downloadable ZIP is empty')
  const seen = new Set<string>()
  for (const entry of entries) {
    if (!entry || entry.startsWith('/') || entry.includes('\\') || /^[A-Za-z]:/.test(entry) || entry.split('/').includes('..')) {
      throw new Error(`downloadable ZIP contains an unsafe path: ${entry}`)
    }
    if (seen.has(entry)) throw new Error(`downloadable ZIP contains a duplicate entry: ${entry}`)
    seen.add(entry)
  }
  if (dryRun && (entries.length !== 1 || entries[0] !== 'smoke.txt')) {
    throw new Error('dry-run ZIP has unexpected entries')
  }
}
