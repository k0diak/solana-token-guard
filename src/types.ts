// Shared types. Everything a rule sees is normalized Evidence; rules never touch raw API payloads.

export type Severity = 'critical' | 'danger' | 'warn' | 'info' | 'good'

export type SourceName = 'rpc' | 'jupiter' | 'dexscreener' | 'rugcheck'

export interface Flag {
  id: string // stable rule id, e.g. "freeze-authority-active"
  severity: Severity
  message: string // plain English, safe to show an end user
  sources: SourceName[] // where the evidence came from
}

/** On-chain facts read directly from Solana RPC. */
export interface MintFacts {
  program: 'spl-token' | 'token-2022' | 'other'
  decimals: number
  supply: number // UI amount
  mintAuthority: string | null
  freezeAuthority: string | null
  extensions: {
    permanentDelegate: string | null
    transferFeeBps: number | null
    transferHookProgram: string | null
    nonTransferable: boolean
    defaultAccountStateFrozen: boolean
  }
  /** Share of supply (0-100) held by the 10 largest token accounts. Includes pools and burn accounts. */
  top10Pct: number | null
}

export interface MarketFacts {
  name: string | null
  symbol: string | null
  verified: boolean | null
  organicScore: number | null // 0-100, Jupiter
  holderCount: number | null
  createdAt: string | null // ISO
  priceUsd: number | null
  liquidityUsd: number | null
  mcapUsd: number | null
}

export interface DexFacts {
  pairCount: number
  liquidityUsd: number
  volume24hUsd: number
  oldestPairCreatedAt: string | null // ISO
}

export interface RugFacts {
  lpLockedPct: number | null
  risks: { name: string; level: string }[]
  scoreNormalised: number | null // 0-100, higher = riskier
}

export interface Evidence {
  mint: string
  rpc: MintFacts | null
  jupiter: MarketFacts | null
  dexscreener: DexFacts | null
  rugcheck: RugFacts | null
  errors: Partial<Record<SourceName, string>>
}

export type Verdict = 'low-risk' | 'caution' | 'high-risk' | 'insufficient-data'

export interface Report {
  mint: string
  verdict: Verdict
  flags: Flag[]
  summary: { name: string | null; symbol: string | null; priceUsd: number | null; liquidityUsd: number | null; ageDays: number | null }
  sourcesAnswered: SourceName[]
  evidence: Evidence
  checkedAt: string
  disclaimer: string
}
