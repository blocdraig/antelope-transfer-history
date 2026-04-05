import type { TransferRow } from "@/lib/transfer-row"

const HEADERS = [
  "timestamp_utc",
  "from",
  "to",
  "currency",
  "contract",
  "amount",
  "memo",
  "txid",
] as const

function escapeCell(value: string) {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

export function transferRowsToCsv(rows: TransferRow[]) {
  const lines = [
    HEADERS.join(","),
    ...rows.map((r) =>
      [
        r.timestampUtc,
        r.from,
        r.to,
        r.currency,
        r.contract,
        r.amount,
        r.memo,
        r.txid,
      ]
        .map((c) => escapeCell(c))
        .join(","),
    ),
  ]
  return lines.join("\r\n")
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
