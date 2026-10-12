import type { Evidence, Flag, Verdict } from './types.ts'

/**
 * Categorical verdict from flag severities, not a weighted score:
 *   no on-chain data            → insufficient-data (authorities can't be verified)
 *   any critical, or 2+ danger  → high-risk
 *   1 danger, or 3+ warn        → caution
 *   otherwise                   → low-risk
 */
export function decide(e: Evidence, flags: Flag[]): Verdict {
  if (!e.rpc) return 'insufficient-data'
  const count = (s: Flag['severity']) => flags.filter((f) => f.severity === s).length
  if (count('critical') > 0 || count('danger') >= 2) return 'high-risk'
  if (count('danger') === 1 || count('warn') >= 3) return 'caution'
  return 'low-risk'
}
