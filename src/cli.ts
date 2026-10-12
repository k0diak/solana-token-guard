#!/usr/bin/env node
// Usage: solana-token-guard <mint> [more mints] [--json] [--rpc <url>]
import { check } from './index.ts'

const args = process.argv.slice(2)
const json = args.includes('--json')
const rpcAt = args.indexOf('--rpc')
const rpcUrl = rpcAt >= 0 ? args[rpcAt + 1] : process.env.SOLANA_RPC_URL
const mints = args.filter((a, i) => !a.startsWith('--') && (rpcAt < 0 || i !== rpcAt + 1))
if (!mints.length) {
  console.error('usage: solana-token-guard <mint> [more mints] [--json] [--rpc <url>]')
  process.exit(2)
}

const ICON = { critical: '⛔', danger: '🔴', warn: '🟡', info: 'ℹ️ ', good: '🟢' } as const
let worst = 0
for (const mint of mints) {
  try {
    const r = await check(mint, { rpcUrl })
    if (r.verdict === 'high-risk') worst = Math.max(worst, 1)
    if (json) { console.log(JSON.stringify(r)); continue }
    console.log(`\n${r.summary.symbol ?? '?'} (${r.summary.name ?? 'unknown'})  ${mint}`)
    console.log(`verdict: ${r.verdict.toUpperCase()}   sources: ${r.sourcesAnswered.join(', ') || 'none'}`)
    for (const f of r.flags) console.log(`  ${ICON[f.severity]} ${f.message}`)
  } catch (e) {
    worst = Math.max(worst, 2)
    console.error(`${mint}: ${(e as Error).message}`)
  }
}
// Exit code is usable in CI: 0 ok, 1 a high-risk token, 2 an error.
process.exit(worst)
