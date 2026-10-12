// Solana Token Guard: explainable pre-trade risk checks for Solana tokens.
import type { Evidence, Flag, Report, Severity, SourceName, Verdict } from './types.ts'
import { DEFAULT_RPC, fetchMintFacts } from './sources/rpc.ts'
import { fetchDexScreener, fetchJupiter, fetchRugCheck } from './sources/market.ts'
import { ageDays, runRules } from './rules.ts'
import { decide } from './verdict.ts'

export type * from './types.ts'
export { runRules, decide }

export const DISCLAIMER = 'Informational only, not financial advice. Heuristic checks on public data; verify before transacting.'
const MINT_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/
export const isMintAddress = (s: string) => MINT_RE.test(s)

export interface CheckOptions {
  rpcUrl?: string
  timeoutMs?: number
  fetch?: typeof fetch
  now?: number
}

/** Gather evidence from every source in parallel. A failing source is recorded, never thrown. */
export async function collect(mint: string, o: CheckOptions = {}): Promise<Evidence> {
  const f = { timeoutMs: o.timeoutMs, fetch: o.fetch }
  const errors: Evidence['errors'] = {}
  const settle = async <T>(name: SourceName, p: Promise<T>): Promise<T | null> => {
    try { return await p } catch (err) { errors[name] = (err as Error).message; return null }
  }
  const [rpc, jupiter, dexscreener, rugcheck] = await Promise.all([
    settle('rpc', fetchMintFacts(mint, o.rpcUrl ?? DEFAULT_RPC, f)),
    settle('jupiter', fetchJupiter(mint, f)),
    settle('dexscreener', fetchDexScreener(mint, f)),
    settle('rugcheck', fetchRugCheck(mint, f)),
  ])
  return { mint, rpc, jupiter, dexscreener, rugcheck, errors }
}

const ORDER: Severity[] = ['critical', 'danger', 'warn', 'info', 'good']

/** Turn evidence into a report. Pure: same evidence and time, same report. */
export function assess(e: Evidence, now = Date.now()): Report {
  const flags = runRules(e, now).sort((a, b) => ORDER.indexOf(a.severity) - ORDER.indexOf(b.severity))
  const answered = (['rpc', 'jupiter', 'dexscreener', 'rugcheck'] as SourceName[]).filter((s) => e[s] != null)
  return {
    mint: e.mint,
    verdict: decide(e, flags),
    flags,
    summary: {
      name: e.jupiter?.name ?? null,
      symbol: e.jupiter?.symbol ?? null,
      priceUsd: e.jupiter?.priceUsd ?? null,
      liquidityUsd: e.jupiter?.liquidityUsd ?? e.dexscreener?.liquidityUsd ?? null,
      ageDays: ageDays(e, now),
    },
    sourcesAnswered: answered,
    evidence: e,
    checkedAt: new Date(now).toISOString(),
    disclaimer: DISCLAIMER,
  }
}

/** Check one Solana token mint. */
export async function check(mint: string, o: CheckOptions = {}): Promise<Report> {
  if (!isMintAddress(mint)) throw new Error('not a valid Solana mint address')
  return assess(await collect(mint, o), o.now)
}

// ---------- pre-trade guard ----------

export type Decision = 'allow' | 'warn' | 'block'
export interface Policy {
  /** Verdicts that block the trade. */
  blockOn: Verdict[]
  /** Verdicts that allow the trade but return a warning. */
  warnOn: Verdict[]
  /** Flag ids that always block, whatever the verdict (e.g. "freeze-authority-active"). */
  blockFlags?: string[]
}

export const POLICIES: Record<'strict' | 'standard' | 'permissive', Policy> = {
  strict: { blockOn: ['high-risk', 'caution', 'insufficient-data'], warnOn: [], blockFlags: ['freeze-authority-active', 'mint-authority-active', 'permanent-delegate'] },
  standard: { blockOn: ['high-risk'], warnOn: ['caution', 'insufficient-data'], blockFlags: ['permanent-delegate', 'non-transferable'] },
  permissive: { blockOn: [], warnOn: ['high-risk', 'caution', 'insufficient-data'], blockFlags: ['non-transferable'] },
}

export interface GuardResult { decision: Decision; reasons: string[]; report: Report }

/** Decide whether an agent or wallet should go ahead with a trade into this token. */
export async function guard(mint: string, policy: Policy | keyof typeof POLICIES = 'standard', o: CheckOptions = {}): Promise<GuardResult> {
  const p = typeof policy === 'string' ? POLICIES[policy] : policy
  const report = await check(mint, o)
  return { ...decideGuard(report, p), report }
}

export function decideGuard(report: Report, p: Policy): { decision: Decision; reasons: string[] } {
  const hard = report.flags.filter((f) => p.blockFlags?.includes(f.id))
  const bad = report.flags.filter((f: Flag) => f.severity === 'critical' || f.severity === 'danger' || f.severity === 'warn').map((f) => f.message)
  if (hard.length) return { decision: 'block', reasons: hard.map((f) => f.message) }
  if (p.blockOn.includes(report.verdict)) return { decision: 'block', reasons: bad.length ? bad : [`Verdict: ${report.verdict}`] }
  if (p.warnOn.includes(report.verdict)) return { decision: 'warn', reasons: bad.length ? bad : [`Verdict: ${report.verdict}`] }
  return { decision: 'allow', reasons: [] }
}
