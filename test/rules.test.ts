import { test } from 'node:test'
import assert from 'node:assert/strict'
import { assess, decideGuard, POLICIES } from '../src/index.ts'
import { parseMint } from '../src/sources/rpc.ts'
import { parseDexScreener, parseJupiter, parseRugCheck } from '../src/sources/market.ts'
import { NOW, blueChip, stablecoin, freshRug, delegateTrap, midThin, noChain } from './fixtures.ts'

const ids = (r: ReturnType<typeof assess>) => r.flags.map((f) => f.id)

test('blue chip with renounced authorities is low-risk', () => {
  const r = assess(blueChip, NOW)
  assert.equal(r.verdict, 'low-risk')
  assert.ok(ids(r).includes('mint-authority-renounced'))
  assert.equal(r.summary.ageDays, 1200)
})

test('established stablecoin keeps issuer controls without being flagged high-risk', () => {
  const r = assess(stablecoin, NOW)
  assert.equal(r.verdict, 'low-risk')
  assert.equal(r.flags.find((f) => f.id === 'freeze-authority-active')?.severity, 'info')
})

test('fresh rug is high-risk with the reasons spelled out', () => {
  const r = assess(freshRug, NOW)
  assert.equal(r.verdict, 'high-risk')
  for (const id of ['mint-authority-active', 'freeze-authority-active', 'liquidity', 'lp-unlocked', 'top10-concentration', 'age', 'organic-score']) assert.ok(ids(r).includes(id), id)
  assert.equal(r.flags[0].severity, 'danger') // sorted worst first
})

test('Token-2022 permanent delegate is critical even when market data looks healthy', () => {
  const r = assess(delegateTrap, NOW)
  assert.equal(r.verdict, 'high-risk')
  assert.equal(r.flags.find((f) => f.id === 'permanent-delegate')?.severity, 'critical')
})

test('one danger gives caution, not high-risk', () => {
  const r = assess(midThin, NOW)
  assert.equal(r.flags.find((f) => f.id === 'liquidity')?.severity, 'warn')
  assert.equal(r.verdict, 'low-risk')
  const thinner = assess({ ...midThin, jupiter: { ...midThin.jupiter!, liquidityUsd: 6000 }, dexscreener: { ...midThin.dexscreener!, liquidityUsd: 5000 } }, NOW)
  assert.equal(thinner.verdict, 'caution')
})

test('a creator with a rug history counts as a danger', () => {
  const r = assess({ ...midThin, rugcheck: { lpLockedPct: 100, risks: [{ name: 'Creator history of rugged tokens', level: 'danger' }], scoreNormalised: 70 } }, NOW)
  assert.equal(r.flags.find((f) => f.id.startsWith('rugcheck:creator'))?.severity, 'danger')
  assert.equal(r.verdict, 'caution')
})

test('without on-chain data the verdict is insufficient-data', () => {
  assert.equal(assess(noChain, NOW).verdict, 'insufficient-data')
})

test('liquidity disagreement between sources is flagged', () => {
  const r = assess({ ...midThin, dexscreener: { ...midThin.dexscreener!, liquidityUsd: 2_000 } }, NOW)
  assert.ok(ids(r).includes('liquidity-disagreement'))
})

test('guard policies', () => {
  const rug = assess(freshRug, NOW)
  assert.equal(decideGuard(rug, POLICIES.standard).decision, 'block')
  assert.equal(decideGuard(rug, POLICIES.permissive).decision, 'warn')
  const usdc = assess(stablecoin, NOW)
  assert.equal(decideGuard(usdc, POLICIES.standard).decision, 'allow')
  assert.equal(decideGuard(usdc, POLICIES.strict).decision, 'block') // strict refuses any live freeze authority
  assert.equal(decideGuard(assess(delegateTrap, NOW), POLICIES.standard).decision, 'block')
})

test('parseMint reads authorities, Token-2022 extensions and concentration', () => {
  const m = parseMint({
    owner: 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb',
    data: { parsed: { type: 'mint', info: { decimals: 2, supply: '100000', mintAuthority: null, freezeAuthority: 'F', extensions: [
      { extension: 'permanentDelegate', state: { delegate: 'D' } },
      { extension: 'transferFeeConfig', state: { newerTransferFee: { transferFeeBasisPoints: 250 } } },
      { extension: 'transferHook', state: { programId: 'H' } },
    ] } } },
  }, [{ uiAmount: 400 }, { uiAmount: 100 }])
  assert.equal(m.program, 'token-2022')
  assert.equal(m.supply, 1000)
  assert.equal(m.freezeAuthority, 'F')
  assert.equal(m.extensions.permanentDelegate, 'D')
  assert.equal(m.extensions.transferFeeBps, 250)
  assert.equal(m.extensions.transferHookProgram, 'H')
  assert.equal(m.top10Pct, 50)
  assert.throws(() => parseMint({ data: { parsed: { type: 'account', info: {} } } }, null), /not an SPL token mint/)
})

test('market parsers tolerate missing fields and reject empty results', () => {
  assert.throws(() => parseJupiter('X', []), /not listed/)
  const j = parseJupiter('X', [{ id: 'X', symbol: 'X', liquidity: '1234.5', isVerified: true }])
  assert.equal(j.liquidityUsd, 1234.5)
  assert.equal(j.organicScore, null)
  const d = parseDexScreener([{ chainId: 'solana', liquidity: { usd: 10 }, volume: { h24: 5 }, pairCreatedAt: NOW }, { chainId: 'base', liquidity: { usd: 999 } }])
  assert.equal(d.pairCount, 1)
  assert.equal(d.liquidityUsd, 10)
  assert.throws(() => parseDexScreener([]), /no DEX pairs/)
  assert.equal(parseRugCheck({ lpLockedPct: 80, risks: [{ name: 'a', level: 'danger' }] }).risks.length, 1)
})
