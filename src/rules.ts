// Rules engine. Each rule is a pure function of Evidence that returns zero or more flags.
// Thresholds are deliberately conservative and documented next to each rule.
import type { Evidence, Flag, SourceName } from './types.ts'

const DAY = 86_400_000
const usd = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`

/** Earliest known creation time across sources, in whole days. */
export function ageDays(e: Evidence, now = Date.now()): number | null {
  const times = [e.jupiter?.createdAt, e.dexscreener?.oldestPairCreatedAt].map((t) => (t ? Date.parse(t) : NaN)).filter((t) => Number.isFinite(t))
  return times.length ? Math.max(0, Math.floor((now - Math.min(...times)) / DAY)) : null
}

/** Best available liquidity figure and which sources reported it. */
export function liquidity(e: Evidence): { usd: number | null; sources: SourceName[] } {
  const vals: [number, SourceName][] = []
  if (e.jupiter?.liquidityUsd != null) vals.push([e.jupiter.liquidityUsd, 'jupiter'])
  if (e.dexscreener) vals.push([e.dexscreener.liquidityUsd, 'dexscreener'])
  return vals.length ? { usd: Math.max(...vals.map((v) => v[0])), sources: vals.map((v) => v[1]) } : { usd: null, sources: [] }
}

/**
 * "Established" tokens (verified, deep liquidity, at least 6 months old) such as USDC legitimately keep
 * issuer controls. For them, authority findings are reported as info, not as red flags.
 */
export function isEstablished(e: Evidence, now = Date.now()): boolean {
  const age = ageDays(e, now)
  const liq = liquidity(e).usd
  return e.jupiter?.verified === true && liq != null && liq >= 1_000_000 && age != null && age >= 180
}

type Rule = (e: Evidence, ctx: { now: number; established: boolean; age: number | null }) => Flag | Flag[] | null

const authority = (id: string, held: string | null, what: string, risk: string): Rule => (_e, { established }) => {
  if (!held) return { id: `${id}-renounced`, severity: 'good', message: `${what} is renounced.`, sources: ['rpc'] }
  return established
    ? { id: `${id}-active`, severity: 'info', message: `Issuer keeps the ${what.toLowerCase()} (normal for established assets like regulated stablecoins).`, sources: ['rpc'] }
    : { id: `${id}-active`, severity: 'danger', message: `${what} is active: ${risk}`, sources: ['rpc'] }
}

export const RULES: Rule[] = [
  // On-chain controls: the issuer's power over holders.
  (e, c) => (e.rpc ? authority('mint-authority', e.rpc.mintAuthority, 'Mint authority', 'the issuer can create unlimited new supply.')(e, c) : null),
  (e, c) => (e.rpc ? authority('freeze-authority', e.rpc.freezeAuthority, 'Freeze authority', 'the issuer can freeze any holder\'s tokens.')(e, c) : null),
  (e, { established }) => {
    const d = e.rpc?.extensions.permanentDelegate
    if (!d) return null
    return { id: 'permanent-delegate', severity: established ? 'warn' : 'critical', message: 'Token-2022 permanent delegate is set: one address can move or burn tokens from any wallet.', sources: ['rpc'] }
  },
  (e) => {
    const bps = e.rpc?.extensions.transferFeeBps
    if (bps == null || bps === 0) return null
    const pct = bps / 100
    return { id: 'transfer-fee', severity: bps >= 1000 ? 'critical' : 'warn', message: `Every transfer pays a ${pct}% fee to the issuer.`, sources: ['rpc'] }
  },
  (e) => (e.rpc?.extensions.transferHookProgram ? { id: 'transfer-hook', severity: 'warn', message: 'A transfer hook runs custom program code on every transfer; it can block sells.', sources: ['rpc'] } : null),
  (e) => (e.rpc?.extensions.nonTransferable ? { id: 'non-transferable', severity: 'critical', message: 'Token is non-transferable: it cannot be sold or sent.', sources: ['rpc'] } : null),
  (e, { established }) => (e.rpc?.extensions.defaultAccountStateFrozen ? { id: 'default-frozen', severity: established ? 'warn' : 'critical', message: 'New token accounts start frozen; the issuer decides who can trade.', sources: ['rpc'] } : null),

  // Holder concentration. The 10 largest accounts include liquidity pools and burn addresses, so be lenient.
  (e) => {
    const p = e.rpc?.top10Pct
    if (p == null) return null
    if (p >= 90) return { id: 'top10-concentration', severity: 'danger', message: `The 10 largest accounts hold ${p.toFixed(1)}% of supply (includes pools); dump risk is high.`, sources: ['rpc'] }
    if (p >= 60) return { id: 'top10-concentration', severity: 'warn', message: `The 10 largest accounts hold ${p.toFixed(1)}% of supply (includes pools).`, sources: ['rpc'] }
    return null
  },

  // Market depth and quality.
  (e) => {
    if (!e.jupiter && !e.dexscreener) return e.rpc ? { id: 'no-market', severity: 'danger', message: 'No tradable market found on Jupiter or DexScreener.', sources: [] } : null
    const { usd: liq, sources } = liquidity(e)
    if (liq == null) return null
    if (liq < 10_000) return { id: 'liquidity', severity: 'danger', message: `Very thin liquidity (${usd(liq)}): selling may be impossible without crashing the price.`, sources }
    if (liq < 50_000) return { id: 'liquidity', severity: 'warn', message: `Thin liquidity (${usd(liq)}).`, sources }
    if (liq >= 1_000_000) return { id: 'liquidity', severity: 'good', message: `Deep liquidity (${usd(liq)}).`, sources }
    return null
  },
  (e) => {
    const a = e.jupiter?.liquidityUsd, b = e.dexscreener?.liquidityUsd
    if (a == null || b == null || a <= 0 || b <= 0) return null
    // DexScreener only lists a token's top pairs, so it under-counts very liquid tokens. A gap only
    // matters to a trader when the smaller figure is shallow enough to affect an exit.
    if (Math.min(a, b) >= 250_000) return null
    const ratio = Math.max(a, b) / Math.min(a, b)
    return ratio > 5 ? { id: 'liquidity-disagreement', severity: 'warn', message: `Sources disagree on liquidity by ${ratio.toFixed(0)}x (Jupiter ${usd(a)}, DexScreener ${usd(b)}).`, sources: ['jupiter', 'dexscreener'] } : null
  },
  (e) => {
    const s = e.jupiter?.organicScore
    if (s == null) return null
    if (s < 30) return { id: 'organic-score', severity: 'warn', message: `Low organic score (${Math.round(s)}/100): trading volume looks automated.`, sources: ['jupiter'] }
    if (s >= 70) return { id: 'organic-score', severity: 'good', message: `High organic score (${Math.round(s)}/100).`, sources: ['jupiter'] }
    return null
  },
  (e) => (e.jupiter?.verified ? { id: 'verified', severity: 'good', message: 'Verified on Jupiter.', sources: ['jupiter'] } : null),
  (_e, { age }) => {
    if (age == null) return null
    if (age < 3) return { id: 'age', severity: 'warn', message: `Brand new (${age} day${age === 1 ? '' : 's'} old): the highest-risk window for rug pulls.`, sources: ['jupiter', 'dexscreener'] }
    return null
  },

  // Liquidity-pool lock, from RugCheck.
  (e, { age }) => {
    const p = e.rugcheck?.lpLockedPct
    if (p == null) return null
    const liq = liquidity(e).usd
    if (p >= 90) return { id: 'lp-locked', severity: 'good', message: `${p.toFixed(0)}% of pool liquidity is locked or burned.`, sources: ['rugcheck'] }
    if (p < 50 && age != null && age < 30 && (liq == null || liq < 250_000)) {
      return { id: 'lp-unlocked', severity: 'danger', message: `Only ${p.toFixed(0)}% of pool liquidity is locked on a young, thin token: the developer can pull it.`, sources: ['rugcheck'] }
    }
    return null
  },
  // RugCheck's named dangers. Authority findings are skipped (read on-chain above); a creator with a
  // record of rugged tokens is the one RugCheck signal strong enough to count as a danger on its own.
  (e) => (e.rugcheck?.risks ?? []).filter((r) => r.level === 'danger' && !/authority/i.test(r.name)).map((r) => ({
    id: `rugcheck:${r.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    severity: /creator.*rug/i.test(r.name) ? ('danger' as const) : ('warn' as const),
    message: `RugCheck reports: ${r.name}.`,
    sources: ['rugcheck'] as SourceName[],
  })),
]

export function runRules(e: Evidence, now = Date.now()): Flag[] {
  const ctx = { now, established: isEstablished(e, now), age: ageDays(e, now) }
  return RULES.flatMap((r) => {
    const out = r(e, ctx)
    return out == null ? [] : Array.isArray(out) ? out : [out]
  })
}
