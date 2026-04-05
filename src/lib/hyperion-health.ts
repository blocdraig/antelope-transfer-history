import { format } from "date-fns"

import { normalizeEndpointUrl } from "@/lib/chains"

/** Antelope-family default; used only to estimate wall time of `first_indexed_block`. */
const ESTIMATED_BLOCK_MS = 500

export const HYPERION_HEALTH_STALE_MS = 5 * 60 * 1000

export function hyperionHealthQueryKey(baseUrl: string) {
  return ["hyperion-health", normalizeEndpointUrl(baseUrl)] as const
}

export type HyperionHealthUi = {
  /** Human-readable start of indexed history (from head time + block delta). */
  dataSinceLabel: string | null
  coverageLabel: "partial" | "full" | "unknown"
  /** Shown when `head_block_num - last_indexed_block` exceeds threshold. */
  behindWarning: string | null
}

type EsSlice = { first: number; last: number }
type NodeSlice = { headNum: number; headTimeIso: string }

function record(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : null
}

function toNum(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v
  if (typeof v === "string" && v !== "") {
    const n = Number(v)
    if (Number.isFinite(n)) return n
  }
  return null
}

/**
 * Read ES + Nodeos slices from raw `/v2/health` JSON.
 * Hyperion 3.x/4.x payloads often include fields Wharfkit’s struct decoder rejects;
 * this path only needs a few numeric/string fields.
 */
function extractEsAndNodeFromJson(json: unknown): {
  es: EsSlice | null
  node: NodeSlice | null
} {
  let es: EsSlice | null = null
  let node: NodeSlice | null = null
  const top = record(json)
  if (!top) return { es, node }
  const health = top.health
  if (!Array.isArray(health)) return { es, node }

  for (const item of health) {
    const e = record(item)
    const sd = e ? record(e.service_data) : null
    if (!sd) continue

    const first = toNum(sd.first_indexed_block)
    const last = toNum(sd.last_indexed_block)
    if (first !== null && last !== null) es = { first, last }

    const headNum = toNum(sd.head_block_num)
    const headTime = sd.head_block_time
    if (
      headNum !== null &&
      typeof headTime === "string" &&
      headTime.length > 0
    ) {
      node = { headNum, headTimeIso: headTime }
    }
  }

  return { es, node }
}

function estimateDataSinceLabel(
  node: NodeSlice,
  firstIndexed: number,
): string | null {
  const headMs = Date.parse(node.headTimeIso)
  if (!Number.isFinite(headMs)) return null
  const deltaBlocks = node.headNum - firstIndexed
  if (deltaBlocks < 0) return null
  const approx = new Date(headMs - deltaBlocks * ESTIMATED_BLOCK_MS)
  if (!Number.isFinite(approx.getTime())) return null
  return `${format(approx, "LLL d, y")} (estimated)`
}

const BEHIND_BLOCKS_WARN = 100
const PARTIAL_FIRST_BLOCK_THRESHOLD = 10

export function parseHyperionHealthJson(json: unknown): HyperionHealthUi {
  const { es, node } = extractEsAndNodeFromJson(json)

  let coverageLabel: HyperionHealthUi["coverageLabel"] = "unknown"
  if (es) {
    coverageLabel =
      es.first > PARTIAL_FIRST_BLOCK_THRESHOLD ? "partial" : "full"
  }

  let dataSinceLabel: string | null = null
  if (es && node) {
    dataSinceLabel = estimateDataSinceLabel(node, es.first)
  }

  let behindWarning: string | null = null
  if (es && node) {
    const gap = node.headNum - es.last
    if (gap > BEHIND_BLOCKS_WARN) {
      behindWarning = `Indexer is about ${gap} blocks behind the live chain — newest transfers may be missing.`
    }
  }

  return { dataSinceLabel, coverageLabel, behindWarning }
}

export async function fetchHyperionHealthUi(baseUrl: string): Promise<HyperionHealthUi> {
  const root = normalizeEndpointUrl(baseUrl)
  const url = `${root}/v2/health`
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`Health check failed (${res.status}).`)
  }
  let json: unknown
  try {
    json = await res.json()
  } catch {
    throw new Error("Health check returned invalid JSON.")
  }
  return parseHyperionHealthJson(json)
}
