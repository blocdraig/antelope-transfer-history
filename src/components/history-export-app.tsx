import { useMutation, useQueries, useQuery } from "@tanstack/react-query"
import {
  endOfDay,
  endOfMonth,
  endOfYear,
  format,
  startOfDay,
  startOfMonth,
  startOfYear,
  subMonths,
  subYears,
} from "date-fns"
import { CalendarIcon } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import type { DateRange } from "react-day-picker"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Calendar } from "@/components/ui/calendar"
import {
  CHAIN_PRESETS,
  CUSTOM_ENDPOINT_VALUE,
  normalizeEndpointUrl,
  parseEndpointSelectValue,
  presetEndpointValue,
} from "@/lib/chains"
import { downloadCsv, transferRowsToCsv } from "@/lib/csv"
import { fetchTransferHistory } from "@/lib/fetch-account-transfers"
import {
  type HyperionHealthUi,
  HYPERION_HEALTH_STALE_MS,
  fetchHyperionHealthUi,
  hyperionHealthQueryKey,
} from "@/lib/hyperion-health"
import { cn } from "@/lib/utils"

type PeriodKey =
  | "this-month"
  | "last-month"
  | "this-year"
  | "last-year"
  | "custom"

/** Antelope account: lowercase a–z, 1–5, dots; length bounded for sanity. */
const ACCOUNT_RE = /^[a-z1-5.]{1,64}$/

function resolveTimeRange(period: PeriodKey, range: DateRange | undefined) {
  const now = new Date()
  if (period === "this-month") {
    return {
      after: startOfMonth(now).toISOString(),
      before: endOfDay(endOfMonth(now)).toISOString(),
    }
  }
  if (period === "last-month") {
    const ref = subMonths(now, 1)
    return {
      after: startOfMonth(ref).toISOString(),
      before: endOfDay(endOfMonth(ref)).toISOString(),
    }
  }
  if (period === "this-year") {
    return {
      after: startOfYear(now).toISOString(),
      before: endOfDay(endOfYear(now)).toISOString(),
    }
  }
  if (period === "last-year") {
    const ref = subYears(now, 1)
    return {
      after: startOfYear(ref).toISOString(),
      before: endOfDay(endOfYear(ref)).toISOString(),
    }
  }
  if (period === "custom") {
    if (!range?.from || !range?.to) {
      throw new Error("Please choose a start and end date.")
    }
    return {
      after: startOfDay(range.from).toISOString(),
      before: endOfDay(range.to).toISOString(),
    }
  }
  const _never: never = period
  throw new Error(`Unknown period: ${_never}`)
}

function periodToggleValue(period: PeriodKey): readonly PeriodKey[] {
  return [period]
}

function effectiveEndpointUrl<T extends { url: string }>(
  choice: string,
  customUrl: string,
  endpoints: readonly T[],
) {
  const parsed = parseEndpointSelectValue(choice)
  if (parsed === "custom") return normalizeEndpointUrl(customUrl)
  const opt = endpoints[parsed]
  return opt ? normalizeEndpointUrl(opt.url) : ""
}

type HyperionHealthSlot = {
  isPending: boolean
  isError: boolean
  ui: HyperionHealthUi | undefined
}

const idleHealthSlot: HyperionHealthSlot = {
  isPending: false,
  isError: false,
  ui: undefined,
}

function HyperionEndpointHealthLines({
  slot,
  compact,
}: {
  slot: HyperionHealthSlot
  compact?: boolean
}) {
  if (slot.isPending) {
    return (
      <span className="text-muted-foreground text-[11px] leading-snug">
        Checking server…
      </span>
    )
  }
  if (slot.isError) {
    return (
      <span className="text-destructive text-[11px] leading-snug">
        Couldn’t load server status
      </span>
    )
  }
  const ui = slot.ui
  if (!ui) return null

  if (compact) {
    const segs: string[] = []
    if (ui.dataSinceLabel) {
      segs.push(ui.dataSinceLabel.replace(" (estimated)", " est."))
    }
    if (ui.coverageLabel === "partial") segs.push("partial history")
    else if (ui.coverageLabel === "full") segs.push("from early blocks")
    if (ui.behindWarning) segs.push("index lagging")
    if (segs.length === 0) return null
    return (
      <span className="text-muted-foreground truncate text-[11px] leading-snug">
        {segs.join(" · ")}
      </span>
    )
  }

  return (
    <div className="flex flex-col gap-0.5 text-[11px] leading-snug">
      {ui.dataSinceLabel ? (
        <span className="text-muted-foreground">
          Data since {ui.dataSinceLabel}
        </span>
      ) : (
        <span className="text-muted-foreground">Start date unknown</span>
      )}
      {ui.coverageLabel === "partial" ? (
        <span className="text-amber-600 dark:text-amber-400">
          Partial history
        </span>
      ) : ui.coverageLabel === "full" ? (
        <span className="text-muted-foreground">Indexed from early blocks</span>
      ) : (
        <span className="text-muted-foreground">Coverage unknown</span>
      )}
      {ui.behindWarning ? (
        <span className="text-amber-600 dark:text-amber-400">
          {ui.behindWarning}
        </span>
      ) : null}
    </div>
  )
}

function EndpointUrlField<T extends { url: string }>({
  label,
  id,
  endpoints,
  choice,
  customUrl,
  healthSlotForPresetIndex,
  customHealthSlot,
  onChoiceChange,
  onCustomChange,
}: {
  label: string
  id: string
  endpoints: readonly T[]
  choice: string
  customUrl: string
  healthSlotForPresetIndex?: (index: number) => HyperionHealthSlot
  customHealthSlot?: HyperionHealthSlot
  onChoiceChange: (value: string | null) => void
  onCustomChange: (value: string) => void
}) {
  const getPresetSlot = (i: number) =>
    healthSlotForPresetIndex?.(i) ?? idleHealthSlot

  return (
    <div className="grid w-full gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Select value={choice} onValueChange={onChoiceChange}>
        <SelectTrigger
          id={id}
          className="box-border w-full min-w-0 font-mono text-xs whitespace-normal text-left h-auto min-h-9 py-2"
        >
          <SelectValue placeholder="Choose an option">
            {(value: string | null) => {
              if (!value || value === CUSTOM_ENDPOINT_VALUE) {
                const url = customUrl.trim() || "Other server…"
                if (url === "Other server…") return url
                const slot = customHealthSlot ?? idleHealthSlot
                return (
                  <div className="flex min-w-0 flex-col items-start gap-0.5 text-left">
                    <span className="break-all">{url}</span>
                    <HyperionEndpointHealthLines slot={slot} compact />
                  </div>
                )
              }
              const idx = parseEndpointSelectValue(value)
              if (idx === "custom") return "Other server…"
              const opt = endpoints[idx]
              if (!opt) return value
              const slot = getPresetSlot(idx)
              return (
                <div className="flex min-w-0 flex-col items-start gap-0.5 text-left">
                  <span className="break-all">{opt.url}</span>
                  <HyperionEndpointHealthLines slot={slot} compact />
                </div>
              )
            }}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {endpoints.map((opt, i) => (
            <SelectItem
              key={presetEndpointValue(i)}
              value={presetEndpointValue(i)}
              className="items-start font-mono text-xs whitespace-normal [&>span]:w-full [&>span]:min-w-0"
            >
              <div className="flex w-full min-w-0 flex-col gap-1 py-0.5">
                <span className="break-all">{opt.url}</span>
                <HyperionEndpointHealthLines slot={getPresetSlot(i)} />
              </div>
            </SelectItem>
          ))}
          <SelectItem value={CUSTOM_ENDPOINT_VALUE}>Other server…</SelectItem>
        </SelectContent>
      </Select>
      {parseEndpointSelectValue(choice) === "custom" ? (
        <Input
          id={`${id}-custom`}
          value={customUrl}
          onChange={(e) => onCustomChange(e.target.value)}
          placeholder="https://…"
          className="box-border w-full font-mono text-xs"
          autoComplete="off"
        />
      ) : null}
    </div>
  )
}

export function HistoryExportApp() {
  const [chainId, setChainId] = useState(CHAIN_PRESETS[0]!.id)
  const [hyperionChoice, setHyperionChoice] = useState(presetEndpointValue(0))
  const [hyperionCustom, setHyperionCustom] = useState("")
  const [account, setAccount] = useState("")
  const [period, setPeriod] = useState<PeriodKey>("this-month")
  const [dateRange, setDateRange] = useState<DateRange | undefined>()

  const selectedPreset = useMemo(
    () => CHAIN_PRESETS.find((c) => c.id === chainId),
    [chainId],
  )

  useEffect(() => {
    const p = CHAIN_PRESETS.find((c) => c.id === chainId)
    if (!p) return
    setHyperionChoice(
      p.hyperionEndpoints.length > 0
        ? presetEndpointValue(0)
        : CUSTOM_ENDPOINT_VALUE,
    )
    setHyperionCustom("")
  }, [chainId])

  const hyperionUrl = selectedPreset
    ? effectiveEndpointUrl(
        hyperionChoice,
        hyperionCustom,
        selectedPreset.hyperionEndpoints,
      )
    : ""

  const hyperionEndpoints = selectedPreset?.hyperionEndpoints ?? []

  const presetHealthQueries = useQueries({
    queries: hyperionEndpoints.map((e) => ({
      queryKey: hyperionHealthQueryKey(e.url),
      queryFn: () => fetchHyperionHealthUi(e.url),
      staleTime: HYPERION_HEALTH_STALE_MS,
      retry: 1,
    })),
  })

  const customNorm = normalizeEndpointUrl(hyperionCustom)
  const customHealthQuery = useQuery({
    queryKey: hyperionHealthQueryKey(customNorm),
    queryFn: () => fetchHyperionHealthUi(customNorm),
    enabled:
      parseEndpointSelectValue(hyperionChoice) === CUSTOM_ENDPOINT_VALUE &&
      customNorm.startsWith("http"),
    staleTime: HYPERION_HEALTH_STALE_MS,
    retry: 1,
  })

  function healthSlotForPresetIndex(index: number): HyperionHealthSlot {
    const q = presetHealthQueries[index]
    if (!q) return idleHealthSlot
    return {
      isPending: q.isPending,
      isError: q.isError,
      ui: q.data,
    }
  }

  const customHealthSlot: HyperionHealthSlot = {
    isPending: customHealthQuery.isPending,
    isError: customHealthQuery.isError,
    ui: customHealthQuery.data,
  }

  const mutation = useMutation({
    mutationFn: async () => {
      const acc = account.trim().toLowerCase()
      if (!ACCOUNT_RE.test(acc)) {
        throw new Error(
          "That doesn’t look like a valid account name for this network.",
        )
      }
      if (!hyperionUrl.trim()) {
        throw new Error("Choose a server from the list or enter your own link.")
      }
      const { after, before } = resolveTimeRange(period, dateRange)
      return fetchTransferHistory(hyperionUrl, acc, after, before)
    },
  })

  const rows = mutation.data?.rows ?? []
  const canDownload = rows.length > 0 && !mutation.isPending

  const handleDownload = () => {
    if (!rows.length) return
    const csv = transferRowsToCsv(rows)
    const safeAccount = account.trim().toLowerCase() || "account"
    downloadCsv(`transfers-${safeAccount}.csv`, csv)
  }

  const rangeLabel = useMemo(() => {
    if (period === "custom" && dateRange?.from) {
      if (dateRange.to) {
        return `${format(dateRange.from, "LLL d, y")} – ${format(dateRange.to, "LLL d, y")}`
      }
      return format(dateRange.from, "LLL d, y")
    }
    return "Pick a date range"
  }, [period, dateRange])

  return (
    <div className="mx-auto flex min-h-svh max-w-5xl flex-col gap-6 p-6 pb-28">
      <div>
        <h1 className="font-heading text-xl font-medium tracking-tight">
          Transfer history export
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Download your token transfers as a spreadsheet for taxes or records.
          If loading fails, try another server from the list or paste a link
          your wallet or block explorer recommends.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Look up transfers</CardTitle>
          <CardDescription>
            Choose your network, pick a history server, enter your account, and
            select a date range.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <div className="flex w-full max-w-2xl flex-col gap-6">
          <div className="grid w-full gap-2">
            <Label htmlFor="chain">Blockchain</Label>
            <Select value={chainId} onValueChange={(v) => v && setChainId(v)}>
              <SelectTrigger id="chain" className="box-border w-full min-w-0">
                <SelectValue placeholder="Choose blockchain">
                  {(value: string | null) =>
                    CHAIN_PRESETS.find((c) => c.id === value)?.label ??
                    value ??
                    "Choose blockchain"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {CHAIN_PRESETS.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedPreset ? (
              <EndpointUrlField
                label="History server"
                id="hyperion-endpoint"
                endpoints={hyperionEndpoints}
                choice={hyperionChoice}
                customUrl={hyperionCustom}
                healthSlotForPresetIndex={healthSlotForPresetIndex}
                customHealthSlot={customHealthSlot}
                onChoiceChange={(v) => v && setHyperionChoice(v)}
                onCustomChange={setHyperionCustom}
              />
          ) : null}

          <div className="grid w-full gap-2">
            <Label htmlFor="account">Account name</Label>
            <Input
              id="account"
              value={account}
              onChange={(e) => setAccount(e.target.value)}
              placeholder="e.g. myaccount.wam"
              autoComplete="off"
              className="box-border w-full"
            />
          </div>
          </div>

          <div className="grid gap-2">
            <Label>Period</Label>
            <ToggleGroup
              variant="outline"
              spacing={0}
              value={periodToggleValue(period)}
              onValueChange={(v) => {
                const next = v[0] as PeriodKey | undefined
                if (next) setPeriod(next)
              }}
            >
              <ToggleGroupItem value="this-month">This month</ToggleGroupItem>
              <ToggleGroupItem value="last-month">Last month</ToggleGroupItem>
              <ToggleGroupItem value="this-year">This year</ToggleGroupItem>
              <ToggleGroupItem value="last-year">Last year</ToggleGroupItem>
              <ToggleGroupItem value="custom">Custom range</ToggleGroupItem>
            </ToggleGroup>
            {period === "custom" ? (
              <Popover>
                <PopoverTrigger
                  type="button"
                  className={cn(
                    "inline-flex h-9 w-full max-w-2xl items-center justify-start gap-2 rounded-3xl border border-input bg-input/50 px-3 text-left text-sm font-normal",
                    !dateRange?.from && "text-muted-foreground",
                  )}
                >
                  <CalendarIcon className="size-4 shrink-0" />
                  {rangeLabel}
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="range"
                    defaultMonth={dateRange?.from}
                    selected={dateRange}
                    onSelect={setDateRange}
                    numberOfMonths={2}
                  />
                </PopoverContent>
              </Popover>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              onClick={() => mutation.mutate()}
              disabled={mutation.isPending}
            >
              {mutation.isPending ? "Loading…" : "Load transfers"}
            </Button>
          </div>

          {mutation.isError ? (
            <p className="text-destructive text-sm">
              {mutation.error instanceof Error
                ? mutation.error.message
                : String(mutation.error)}
            </p>
          ) : null}

          {mutation.data?.truncated ? (
            <p className="text-amber-600 text-sm dark:text-amber-400">
              Only part of your history fits in one download. Use a shorter
              date range or run another export for the rest.
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card className="min-h-[200px] flex-1">
        <CardHeader>
          <CardTitle>Preview</CardTitle>
          <CardDescription>
            {rows.length
              ? `${rows.length} transfer${rows.length === 1 ? "" : "s"} loaded.`
              : "Load transfers above to see them here."}
          </CardDescription>
        </CardHeader>
        <CardContent className="max-h-[min(420px,50vh)] overflow-auto rounded-2xl ring-1 ring-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="whitespace-nowrap">Time</TableHead>
                <TableHead>From</TableHead>
                <TableHead>To</TableHead>
                <TableHead>Token</TableHead>
                <TableHead>Contract</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Note</TableHead>
                <TableHead className="min-w-[140px]">Transaction</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={8}
                    className="text-muted-foreground h-24 text-center"
                  >
                    Nothing loaded yet
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((r, i) => (
                  <TableRow key={`${r.txid}-${i}`}>
                    <TableCell className="whitespace-nowrap font-mono text-xs">
                      {r.timestampUtc}
                    </TableCell>
                    <TableCell className="max-w-[120px] truncate">
                      {r.from}
                    </TableCell>
                    <TableCell className="max-w-[120px] truncate">
                      {r.to}
                    </TableCell>
                    <TableCell className="max-w-[80px] truncate">
                      {r.currency}
                    </TableCell>
                    <TableCell className="max-w-[120px] truncate font-mono text-xs">
                      {r.contract}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "font-mono text-xs",
                        r.amount.trim().startsWith("-") &&
                          "text-amber-700 dark:text-amber-400",
                      )}
                    >
                      {r.amount}
                    </TableCell>
                    <TableCell className="max-w-[160px] truncate" title={r.memo}>
                      {r.memo || "—"}
                    </TableCell>
                    <TableCell
                      className="max-w-[160px] truncate font-mono text-xs"
                      title={r.txid}
                    >
                      {r.txid}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div
        className="border-border supports-backdrop-filter:bg-background/80 fixed inset-x-0 bottom-0 z-50 border-t bg-background/95 p-4 shadow-[0_-4px_24px_rgba(0,0,0,0.06)] backdrop-blur-md dark:shadow-[0_-4px_24px_rgba(0,0,0,0.25)]"
        role="region"
        aria-label="Download"
      >
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4">
          <p className="text-muted-foreground text-sm">
            {canDownload
              ? "Your file includes date and time, sender, recipient, token, contract, signed amount (negative when sent from your account), note, and transaction ID."
              : "Load transfers first, then download your spreadsheet."}
          </p>
          <Button
            type="button"
            size="lg"
            disabled={!canDownload}
            onClick={handleDownload}
          >
            Download CSV
          </Button>
        </div>
      </div>
    </div>
  )
}
