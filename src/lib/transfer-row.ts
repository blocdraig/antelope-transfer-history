import type { Types } from "@wharfkit/hyperion"

export type TransferRow = {
  timestampUtc: string
  from: string
  to: string
  /** Token symbol (e.g. WAX, EOS). */
  currency: string
  /** Issuing contract account. */
  contract: string
  amount: string
  memo: string
  txid: string
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null
}

function parseQuantity(
  quantity: unknown
): { amount: string; symbol: string } | null {
  if (typeof quantity !== "string") return null
  const trimmed = quantity.trim()
  const idx = trimmed.lastIndexOf(" ")
  if (idx <= 0) return { amount: trimmed, symbol: "" }
  return {
    amount: trimmed.slice(0, idx).trim(),
    symbol: trimmed.slice(idx + 1).trim(),
  }
}

function timestampToUtcIso(ts: Types.v2.Action["timestamp"]) {
  try {
    return ts.toDate().toISOString()
  } catch {
    return String(ts)
  }
}

function normAccount(s: string) {
  return s.trim().toLowerCase()
}

/** Outgoing-only transfers show a leading minus; self-transfers stay unsigned. */
function amountSignedForViewer(
  rawAmount: string,
  from: string,
  to: string,
  viewerAccount: string,
) {
  const v = normAccount(viewerAccount)
  const f = normAccount(from)
  const t = normAccount(to)
  const outgoing = f === v
  const incoming = t === v
  const a = rawAmount.trim()
  const stripPlus = (s: string) => (s.startsWith("+") ? s.slice(1).trim() : s)
  const unsigned = stripPlus(a.startsWith("-") ? a.slice(1).trim() : a)
  if (outgoing && !incoming) {
    return unsigned === "" ? a : `-${unsigned}`
  }
  return unsigned === "" ? a : unsigned
}

/** Map Hyperion actions to CSV rows; only standard `transfer` actions with expected fields. */
export function actionsToTransferRows(
  actions: Types.v2.Action[],
  viewerAccount: string,
): TransferRow[] {
  const rows: TransferRow[] = []
  for (const action of actions) {
    const name = String(action.act.name)
    if (name !== "transfer") continue
    const data = action.act.data
    if (!isRecord(data)) continue
    const from = data.from
    const to = data.to
    const quantity = data.quantity
    const memo = data.memo
    if (typeof from !== "string" || typeof to !== "string") continue
    const parsed = parseQuantity(quantity)
    if (!parsed) continue
    const contract = String(action.act.account)
    const currency = parsed.symbol

    rows.push({
      timestampUtc: timestampToUtcIso(action.timestamp),
      from,
      to,
      currency,
      contract,
      amount: amountSignedForViewer(parsed.amount, from, to, viewerAccount),
      memo: typeof memo === "string" ? memo : "",
      txid: String(action.trx_id),
    })
  }
  return rows
}
