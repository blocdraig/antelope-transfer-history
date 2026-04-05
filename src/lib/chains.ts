/**
 * Preset Antelope networks. Edit `hyperionEndpoints` per chain.
 * Public endpoints may change — verify before production use.
 */
/** Index coverage hint for the UI (full vs partial history). */
export type HyperionCoverage = "full" | "partial"

export type HyperionEndpoint = {
  url: string
  coverage: HyperionCoverage
}

export type ChainPreset = {
  id: string
  label: string
  hyperionEndpoints: HyperionEndpoint[]
}

/** Select value for a preset list item by index */
export function presetEndpointValue(index: number) {
  return `p-${index}`
}

export const CUSTOM_ENDPOINT_VALUE = "custom"

export function parseEndpointSelectValue(
  value: string | null
): number | "custom" {
  if (!value || value === CUSTOM_ENDPOINT_VALUE) return "custom"
  if (value.startsWith("p-")) {
    const n = Number.parseInt(value.slice(2), 10)
    return Number.isFinite(n) ? n : "custom"
  }
  return "custom"
}

export function hyperionMenuLabel(opt: HyperionEndpoint) {
  const note = opt.coverage === "full" ? "Full records" : "May be incomplete"
  return `${opt.url} · ${note}`
}

export const CHAIN_PRESETS: ChainPreset[] = [
  {
    id: "vaulta",
    label: "Vaulta (EOS)",
    hyperionEndpoints: [
      // partial coverage
      { url: "https://eos.hyperion.eosrio.io", coverage: "partial" },
      { url: "https://eos.eosusa.io", coverage: "partial" },
      { url: "https://vaulta-hyperion.eosphere.io", coverage: "partial" },
    ],
  },
  {
    id: "wax",
    label: "WAX",
    hyperionEndpoints: [
      // full coverage
      { url: "https://history.waxsweden.org", coverage: "full" },
      { url: "https://wax.eosphere.io", coverage: "full" },
      { url: "https://hyperion7.sentnl.io", coverage: "full" },
      { url: "https://wax-hyperion.alcor.exchange", coverage: "full" },
      // partial coverage
      { url: "https://wax.eosusa.io", coverage: "partial" },
      { url: "https://wax.eosrio.io", coverage: "partial" },
      { url: "https://wax.cryptolions.io", coverage: "partial" },
      { url: "https://hyperion.wax.detroitledger.tech", coverage: "partial" },
      { url: "https://api.waxsweden.org", coverage: "partial" },
      { url: "https://wax.hivebp.io", coverage: "partial" },
      { url: "https://hyperion-wax-mainnet.wecan.dev", coverage: "full" },
    ],
  },
  {
    id: "telos",
    label: "Telos",
    hyperionEndpoints: [
      // partial coverage
      { url: "https://telos.eosphere.io", coverage: "full" },
      { url: "https://telosgermany.genereos.io", coverage: "full" },
    ],
  },
]

export function normalizeEndpointUrl(url: string) {
  return url.trim().replace(/\/+$/, "")
}
