// Hand-built Evidence for known token shapes. Times are relative to NOW so tests never go stale.
import type { Evidence, MintFacts } from '../src/types.ts'

export const NOW = Date.parse('2026-10-12T00:00:00Z')
const daysAgo = (d: number) => new Date(NOW - d * 86_400_000).toISOString()

const cleanMint = (over: Partial<MintFacts> = {}): MintFacts => ({
  program: 'spl-token', decimals: 6, supply: 1e9, mintAuthority: null, freezeAuthority: null,
  extensions: { permanentDelegate: null, transferFeeBps: null, transferHookProgram: null, nonTransferable: false, defaultAccountStateFrozen: false },
  top10Pct: 25, ...over,
})

const base = (over: Partial<Evidence>): Evidence => ({ mint: 'TestMint11111111111111111111111111111111111', rpc: cleanMint(), jupiter: null, dexscreener: null, rugcheck: null, errors: {}, ...over })

/** Large, old, renounced memecoin, BONK-like. */
export const blueChip = base({
  jupiter: { name: 'Blue', symbol: 'BLUE', verified: true, organicScore: 90, holderCount: 900_000, createdAt: daysAgo(1200), priceUsd: 0.00002, liquidityUsd: 6_000_000, mcapUsd: 1e9 },
  dexscreener: { pairCount: 30, liquidityUsd: 4_000_000, volume24hUsd: 2_000_000, oldestPairCreatedAt: daysAgo(1190) },
  rugcheck: { lpLockedPct: 4, risks: [{ name: 'Mutable metadata', level: 'warn' }], scoreNormalised: 5 },
})

/** USDC-like: issuer keeps mint and freeze authority, but verified, deep and old. */
export const stablecoin = base({
  rpc: cleanMint({ mintAuthority: 'Issuer1111111111111111111111111111111111111', freezeAuthority: 'Issuer1111111111111111111111111111111111111', top10Pct: 40 }),
  jupiter: { name: 'USD Coin', symbol: 'USDC', verified: true, organicScore: 95, holderCount: 5_000_000, createdAt: daysAgo(1800), priceUsd: 1, liquidityUsd: 300_000_000, mcapUsd: 9e9 },
  dexscreener: { pairCount: 200, liquidityUsd: 250_000_000, volume24hUsd: 500_000_000, oldestPairCreatedAt: daysAgo(1700) },
})

/** Classic fresh rug: authorities live, tiny liquidity, unlocked LP, concentrated, 1 day old. */
export const freshRug = base({
  rpc: cleanMint({ mintAuthority: 'Dev11111111111111111111111111111111111111111', freezeAuthority: 'Dev11111111111111111111111111111111111111111', top10Pct: 97 }),
  jupiter: { name: 'Moon', symbol: 'MOON', verified: false, organicScore: 12, holderCount: 140, createdAt: daysAgo(1), priceUsd: 0.0001, liquidityUsd: 4_000, mcapUsd: 90_000 },
  dexscreener: { pairCount: 1, liquidityUsd: 3_800, volume24hUsd: 250_000, oldestPairCreatedAt: daysAgo(1) },
  rugcheck: { lpLockedPct: 0, risks: [{ name: 'Single holder ownership', level: 'danger' }], scoreNormalised: 88 },
})

/** Token-2022 honeypot: looks fine on market data, but a permanent delegate can take tokens back. */
export const delegateTrap = base({
  rpc: cleanMint({ program: 'token-2022', extensions: { permanentDelegate: 'Dev11111111111111111111111111111111111111111', transferFeeBps: null, transferHookProgram: null, nonTransferable: false, defaultAccountStateFrozen: false } }),
  jupiter: { name: 'Trap', symbol: 'TRAP', verified: false, organicScore: 60, holderCount: 3000, createdAt: daysAgo(40), priceUsd: 0.01, liquidityUsd: 400_000, mcapUsd: 5e6 },
  dexscreener: { pairCount: 3, liquidityUsd: 380_000, volume24hUsd: 90_000, oldestPairCreatedAt: daysAgo(40) },
})

/** Mid-size token with one real concern (thin liquidity) and nothing else. */
export const midThin = base({
  jupiter: { name: 'Mid', symbol: 'MID', verified: false, organicScore: 55, holderCount: 2000, createdAt: daysAgo(90), priceUsd: 0.2, liquidityUsd: 30_000, mcapUsd: 2e6 },
  dexscreener: { pairCount: 2, liquidityUsd: 28_000, volume24hUsd: 9_000, oldestPairCreatedAt: daysAgo(90) },
  rugcheck: { lpLockedPct: 100, risks: [], scoreNormalised: 20 },
})

/** RPC unreachable: market data alone must not produce a confident verdict. */
export const noChain = base({ rpc: null, jupiter: blueChip.jupiter, dexscreener: blueChip.dexscreener, errors: { rpc: 'timeout' } })
