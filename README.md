# Solana Token Guard

Explainable pre-trade risk checks for Solana tokens, built for AI agents, wallets and bots. Keyless and MIT-licensed.

```js
import { check, guard } from 'solana-token-guard'

const report = await check('DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263')
report.verdict // 'low-risk' | 'caution' | 'high-risk' | 'insufficient-data'
report.flags   // [{ id, severity, message, sources }], worst first

const { decision, reasons } = await guard(mint, 'standard') // 'allow' | 'warn' | 'block'
```

```bash
npx solana-token-guard <mint> [more mints] [--json] [--rpc <url>]   # exit 1 if any token is high-risk
```

## What it checks

| Source | Checks |
|---|---|
| **Solana RPC** (on-chain, no third party) | mint authority, freeze authority, Token-2022 permanent delegate, transfer fee, transfer hook, non-transferable, default-frozen accounts, top-10 holder share |
| **Jupiter** | verification, organic-volume score, liquidity, age |
| **DexScreener** | pairs, liquidity, volume, oldest pair |
| **RugCheck** | LP lock share, creator rug history, named risks |

**How the verdict is reached.** It's categorical and explainable, not a weighted score:

| Verdict | When |
|---|---|
| `high-risk` | any critical flag, or two or more dangers |
| `caution` | one danger, or three or more warnings |
| `low-risk` | otherwise |
| `insufficient-data` | Solana RPC didn't answer, so authorities can't be verified |

Any market source can fail without breaking a check; `sourcesAnswered` lists the sources that responded.

**Established assets.** Verified tokens with at least $1M liquidity that are 6 or more months old, such as USDC, legitimately keep issuer controls. For them, authority findings are reported as info, not red flags.

**Guard policies:**

| Policy | Blocks | Warns |
|---|---|---|
| `strict` | caution, high-risk and insufficient-data; any live mint or freeze authority; any permanent delegate | — |
| `standard` | high-risk; permanent delegate; non-transferable | caution, insufficient-data |
| `permissive` | non-transferable only | everything else |

You can also pass your own `{ blockOn, warnOn, blockFlags }`.

## Develop

Node 22.18+ runs the TypeScript sources directly.

```bash
npm test
node src/cli.ts <mint>
```

## Disclaimer

Informational only, not financial advice. These are heuristic checks on public data; verify before transacting.
