export interface FetchOptions {
  timeoutMs?: number
  fetch?: typeof fetch
}

/** JSON fetch with a hard timeout. Throws on non-2xx so each source can record why it failed. */
export async function getJson(url: string, init: RequestInit = {}, opts: FetchOptions = {}): Promise<any> {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), opts.timeoutMs ?? 6000)
  try {
    const res = await (opts.fetch ?? fetch)(url, { ...init, signal: ctl.signal, headers: { Accept: 'application/json', ...(init.headers ?? {}) } })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.json()
  } finally {
    clearTimeout(timer)
  }
}

export const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : null)
