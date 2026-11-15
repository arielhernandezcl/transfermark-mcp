/**
 * Configuración global del servidor, controlada por variables de entorno.
 *
 * - TRANSFERMARKT_DOMAIN  dominio de Transfermarkt a consultar (por defecto "es")
 * - TRANSFERMARKT_LOCALE  locale Accept-Language para la API (se deduce del dominio)
 * - TRANSFERMARKT_CONTEXT contexto X-Preferred-Context para la API (se deduce del dominio)
 * - TRANSFERMARKT_CACHE_TTL_MINUTES  TTL por defecto de la caché en minutos
 * - TRANSFERMARKT_RATE_LIMIT_MS    separación mínima entre peticiones al mismo host
 * - TRANSFERMARKT_TIMEOUT_MS       timeout de las peticiones HTTP
 * - TRANSFERMARKT_USER_AGENT       User-Agent enviado a Transfermarkt
 */

/** Dominios soportados: dominio web -> contexto de API y locale. */
const DOMAINS: Record<string, { context: string; locale: string }> = {
  es: { context: "es", locale: "es-ES" },
  us: { context: "us", locale: "en-US" },
  de: { context: "de", locale: "de-DE" },
  at: { context: "at", locale: "de-AT" },
  ch: { context: "ch", locale: "de-CH" },
  "co.uk": { context: "uk", locale: "en-GB" },
  com: { context: "com", locale: "en-US" },
  it: { context: "it", locale: "it-IT" },
  fr: { context: "fr", locale: "fr-FR" },
  pt: { context: "pt", locale: "pt-PT" },
  nl: { context: "nl", locale: "nl-NL" },
  ru: { context: "ru", locale: "ru-RU" },
  tr: { context: "tr", locale: "tr-TR" },
  pl: { context: "pl", locale: "pl-PL" },
  "com.tr": { context: "com.tr", locale: "tr-TR" },
};

function numEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function pickDomain(): string {
  const raw = (process.env.TRANSFERMARKT_DOMAIN ?? "es").trim().toLowerCase();
  if (raw in DOMAINS) return raw;
  // Aceptamos también un TLD suelto ("uk" -> "co.uk", "mx" -> unknown).
  const alias: Record<string, string> = { uk: "co.uk", mx: "com.mx" };
  const normalized = alias[raw] ?? raw;
  if (normalized in DOMAINS) return normalized;
  throw new Error(
    `TRANSFERMARKT_DOMAIN inválido: "${raw}". Opciones: ${Object.keys(DOMAINS).join(", ")}`,
  );
}

const domain = pickDomain();
const defaults = DOMAINS[domain]!;

export const config = {
  domain,
  context: process.env.TRANSFERMARKT_CONTEXT?.trim() || defaults.context,
  locale: process.env.TRANSFERMARKT_LOCALE?.trim() || defaults.locale,
  /** Base del sitio web de Transfermarkt para el dominio activo. */
  webBase: `https://www.transfermarkt.${domain}`,
  /** Base de la API JSON oficial. */
  apiBase: "https://tmapi.transfermarkt.technology",
  cacheTtlMs: numEnv("TRANSFERMARKT_CACHE_TTL_MINUTES", 30) * 60_000,
  /** Separación mínima entre peticiones al mismo host (ms). */
  rateLimitMs: numEnv("TRANSFERMARKT_RATE_LIMIT_MS", 250),
  timeoutMs: numEnv("TRANSFERMARKT_TIMEOUT_MS", 20_000),
  userAgent:
    process.env.TRANSFERMARKT_USER_AGENT?.trim() ||
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  /** Nº máximo de peticiones simultáneas al mismo host. */
  maxConcurrency: numEnv("TRANSFERMARKT_MAX_CONCURRENCY", 6),
} as const;

export type Config = typeof config;
