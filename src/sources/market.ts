// Public, keyless market and risk sources. Each parser is pure so tests can run on recorded payloads.
import { getJson, num, type FetchOptions } from '../http.ts'
import type { DexFacts, MarketFacts, RugFacts } from '../types.ts'

export function parseJupiter(mint: string, results: any): MarketFacts {
  const t = Array.isArray(results) ? results.find((x) => x?.id === mint) : null
  if (!t) throw new Error('not listed on Jupiter')
  return {
    name: t.name ?? null,
    symbol: t.symbol ?? null,
    verified: typeof t.isVerified === 'boolean' ? t.isVerified : null,
    organicScore: num(t.organicScore),
    holderCount: num(t.holderCount),
    createdAt: t.createdAt ?? t.firstPool?.createdAt ?? null,
    priceUsd: num(t.usdPrice),
    liquidityUsd: num(t.liquidity),
    mcapUsd: num(t.mcap),
  }
}

export function parseDexScreener(pairs: any): DexFacts {
  const list = (Array.isArray(pairs) ? pairs : pairs?.pairs ?? []).filter((p: any) => p?.chainId === 'solana')
  if (!list.length) throw new Error('no DEX pairs')
  const created = list.map((p: any) => num(p.pairCreatedAt)).filter((v: number | null): v is number => v != null)
  return {
    pairCount: list.length,
    liquidityUsd: list.reduce((s: number, p: any) => s + (num(p.liquidity?.usd) ?? 0), 0),
    volume24hUsd: list.reduce((s: number, p: any) => s + (num(p.volume?.h24) ?? 0), 0),
    oldestPairCreatedAt: created.length ? new Date(Math.min(...created)).toISOString() : null,
  }
}

export function parseRugCheck(d: any): RugFacts {
  if (!d || typeof d !== 'object') throw new Error('empty RugCheck report')
  return {
    lpLockedPct: num(d.lpLockedPct),
    risks: Array.isArray(d.risks) ? d.risks.map((r: any) => ({ name: String(r?.name ?? ''), level: String(r?.level ?? '') })) : [],
    scoreNormalised: num(d.score_normalised),
  }
}

export const fetchJupiter = async (mint: string, o: FetchOptions = {}) =>
  parseJupiter(mint, await getJson(`https://lite-api.jup.ag/tokens/v2/search?query=${mint}`, {}, o))

export const fetchDexScreener = async (mint: string, o: FetchOptions = {}) =>
  parseDexScreener(await getJson(`https://api.dexscreener.com/token-pairs/v1/solana/${mint}`, {}, o))

export const fetchRugCheck = async (mint: string, o: FetchOptions = {}) =>
  parseRugCheck(await getJson(`https://api.rugcheck.xyz/v1/tokens/${mint}/report/summary`, {}, o))
