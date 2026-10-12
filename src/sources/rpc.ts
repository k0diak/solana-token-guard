// On-chain facts straight from Solana JSON-RPC: authorities, Token-2022 extensions, holder concentration.
import { getJson, num, type FetchOptions } from '../http.ts'
import type { MintFacts } from '../types.ts'

export const DEFAULT_RPC = 'https://api.mainnet-beta.solana.com'
const SPL_TOKEN = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'
const TOKEN_2022 = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb'

async function rpc(url: string, method: string, params: unknown[], opts: FetchOptions) {
  const body = await getJson(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) }, opts)
  if (body.error) throw new Error(`${method}: ${body.error.message ?? 'rpc error'}`)
  return body.result
}

export function parseMint(account: any, largest: any[] | null): MintFacts {
  const owner = account?.owner
  const info = account?.data?.parsed?.info
  if (!info || account?.data?.parsed?.type !== 'mint') throw new Error('not an SPL token mint')
  const ext = (name: string) => (info.extensions ?? []).find((e: any) => e.extension === name)
  const fee = ext('transferFeeConfig')?.state
  const decimals = num(info.decimals) ?? 0
  const supply = (num(info.supply) ?? 0) / 10 ** decimals
  let top10Pct: number | null = null
  if (largest && supply > 0) {
    const held = largest.slice(0, 10).reduce((s, a) => s + (num(a.uiAmount) ?? num(a.uiAmountString) ?? 0), 0)
    top10Pct = Math.min(100, (held / supply) * 100)
  }
  return {
    program: owner === SPL_TOKEN ? 'spl-token' : owner === TOKEN_2022 ? 'token-2022' : 'other',
    decimals,
    supply,
    mintAuthority: info.mintAuthority ?? null,
    freezeAuthority: info.freezeAuthority ?? null,
    extensions: {
      permanentDelegate: ext('permanentDelegate')?.state?.delegate ?? null,
      transferFeeBps: fee ? num(fee.newerTransferFee?.transferFeeBasisPoints) ?? num(fee.olderTransferFee?.transferFeeBasisPoints) : null,
      transferHookProgram: ext('transferHook')?.state?.programId ?? null,
      nonTransferable: !!ext('nonTransferable'),
      defaultAccountStateFrozen: ext('defaultAccountState')?.state?.accountState === 'frozen',
    },
    top10Pct,
  }
}

export async function fetchMintFacts(mint: string, rpcUrl = DEFAULT_RPC, opts: FetchOptions = {}): Promise<MintFacts> {
  const [acct, largest] = await Promise.all([
    rpc(rpcUrl, 'getAccountInfo', [mint, { encoding: 'jsonParsed', commitment: 'confirmed' }], opts),
    // Largest-accounts is rate-limited on public RPC; concentration is optional, authorities are not.
    rpc(rpcUrl, 'getTokenLargestAccounts', [mint, { commitment: 'confirmed' }], opts).catch(() => null),
  ])
  if (!acct?.value) throw new Error('mint account not found')
  return parseMint(acct.value, largest?.value ?? null)
}
