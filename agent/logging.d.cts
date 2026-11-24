export function secretValues(env?: NodeJS.ProcessEnv, home?: string): string[]
export function createRedactor(values?: string[]): {add(value: string): void; redact(value: unknown): string}
export function commandPreview(command: unknown, limit?: number): string
export function createProgressReporter(report: (message: string) => void): (event: unknown) => void
export function formatWorkerItem(item: unknown): string
export function createWorkerLog(directory: string, redactor: ReturnType<typeof createRedactor>): {event(event: unknown): string | undefined; text(value: unknown): string}
export function installTranscript(file: string, redactor: ReturnType<typeof createRedactor>): () => void
