import { addDays, addMilliseconds } from "date-fns"
import { APIClient } from "@wharfkit/antelope"
import { HyperionAPIClient, type Types } from "@wharfkit/hyperion"

import { normalizeEndpointUrl } from "@/lib/chains"
import { actionsToTransferRows, type TransferRow } from "@/lib/transfer-row"

const PAGE_SIZE = 500
const MAX_PAGES = 50
/** Upper bound for `global_sequence` range filter (2^64 − 1). */
const GLOBAL_SEQ_MAX = "18446744073709551615"

/**
 * Many Hyperion nodes limit `get_actions` with sort=asc so each request’s
 * `after`→`before` window stays within ~90 days. We chunk longer ranges.
 */
const MAX_WINDOW_DAYS = 89

function actionGlobalSeqBigint(action: Types.v2.Action) {
  return BigInt(String(action.global_sequence))
}

/** Split [after, before] into windows of at most MAX_WINDOW_DAYS (half-open advance). */
function chunkTimeRange(after: Date, before: Date) {
  const chunks: { start: Date; end: Date }[] = []
  let start = after
  while (start.getTime() <= before.getTime()) {
    const tentativeEnd = addDays(start, MAX_WINDOW_DAYS)
    const end =
      tentativeEnd.getTime() > before.getTime() ? before : tentativeEnd
    chunks.push({ start: new Date(start), end: new Date(end) })
    if (end.getTime() >= before.getTime()) break
    start = addMilliseconds(end, 1)
  }
  return chunks
}

export type FetchTransfersResult = {
  rows: TransferRow[]
  truncated: boolean
  totalActionsInRange?: number
}

async function fetchActionsOneWindow(
  hyperion: HyperionAPIClient,
  account: string,
  afterIso: string,
  beforeIso: string,
): Promise<{
  rows: TransferRow[]
  truncated: boolean
  totalFirstPage?: number
}> {
  const collected: TransferRow[] = []
  let totalFirstPage: number | undefined
  let minGlobalSeqExclusive: bigint | null = null

  async function fetchPage(limit: number) {
    const base = {
      filter: "*:transfer",
      after: afterIso,
      before: beforeIso,
      limit,
      sort: "asc",
    }
    const withSeq =
      minGlobalSeqExclusive !== null
        ? {
            ...base,
            global_sequence: `${minGlobalSeqExclusive.toString()}-${GLOBAL_SEQ_MAX}`,
          }
        : base
    return hyperion.v2.history.get_actions(
      account,
      withSeq as Parameters<typeof hyperion.v2.history.get_actions>[1],
    )
  }

  for (let p = 0; p < MAX_PAGES; p++) {
    const res = await fetchPage(PAGE_SIZE)

    if (totalFirstPage === undefined && res.total?.value !== undefined) {
      totalFirstPage = Number(res.total.value)
    }

    if (res.actions.length === 0) {
      return { rows: collected, truncated: false, totalFirstPage }
    }

    collected.push(...actionsToTransferRows(res.actions, account))

    const last = res.actions[res.actions.length - 1]!
    minGlobalSeqExclusive = actionGlobalSeqBigint(last) + 1n

    if (res.actions.length < PAGE_SIZE) {
      return { rows: collected, truncated: false, totalFirstPage }
    }
  }

  const probe = await fetchPage(1)
  const truncated = probe.actions.length > 0

  return { rows: collected, truncated, totalFirstPage }
}

function sortTransferRows(rows: TransferRow[]) {
  return [...rows].sort((a, b) => {
    const t = a.timestampUtc.localeCompare(b.timestampUtc)
    if (t !== 0) return t
    const x = a.txid.localeCompare(b.txid)
    if (x !== 0) return x
    return transferRowStableKey(a).localeCompare(transferRowStableKey(b))
  })
}

function transferRowStableKey(r: TransferRow) {
  return `${r.from}\t${r.to}\t${r.currency}\t${r.contract}\t${r.amount}\t${r.memo}`
}

export async function fetchTransferHistory(
  hyperionUrl: string,
  account: string,
  afterIso: string,
  beforeIso: string,
): Promise<FetchTransfersResult> {
  const hyperionBase = normalizeEndpointUrl(hyperionUrl)
  const hyperionClient = new APIClient({ url: hyperionBase })
  const hyperion = new HyperionAPIClient(hyperionClient)

  const rangeAfter = new Date(afterIso)
  const rangeBefore = new Date(beforeIso)
  const windows = chunkTimeRange(rangeAfter, rangeBefore)

  const merged: TransferRow[] = []
  let truncated = false
  let totalActionsInRange: number | undefined

  for (let i = 0; i < windows.length; i++) {
    const w = windows[i]!
    const { rows, truncated: windowTruncated, totalFirstPage } =
      await fetchActionsOneWindow(
        hyperion,
        account,
        w.start.toISOString(),
        w.end.toISOString(),
      )

    merged.push(...rows)
    if (windowTruncated) truncated = true
    // Total from API is only meaningful for a single window; multi-chunk totals differ per slice.
    if (windows.length === 1 && i === 0 && totalFirstPage !== undefined) {
      totalActionsInRange = totalFirstPage
    }
  }

  return {
    rows: sortTransferRows(merged),
    truncated,
    totalActionsInRange,
  }
}
