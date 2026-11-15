/**
 * Cliente HTTP común: User-Agent realista, timeout, reintentos con backoff,
 * limitación de tasa por host y límite de concurrencia.
 */

import { config } from "./config.ts";

export class HttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly url: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

/** Estado de la limitación de tasa por host. */
interface HostState {
  nextAvailableAt: number;
  active: number;
  waiters: Array<() => void>;
}

const hosts = new Map<string, HostState>();

function hostState(url: string): HostState {
  const host = new URL(url).host;
  let state = hosts.get(host);
  if (!state) {
    state = { nextAvailableAt: 0, active: 0, waiters: [] };
    hosts.set(host, state);
  }
  return state;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Espera a que el host permita otra petición y registra esta como activa. */
async function acquire(url: string): Promise<void> {
  const state = hostState(url);
  while (state.active >= config.maxConcurrency) {
    await new Promise<void>((resolve) => state.waiters.push(resolve));
  }
  state.active++;
  const now = Date.now();
  if (state.nextAvailableAt > now) {
    await sleep(state.nextAvailableAt - now);
  }
  state.nextAvailableAt = Date.now() + config.rateLimitMs;
}

function release(url: string): void {
  const state = hostState(url);
  state.active = Math.max(0, state.active - 1);
  const next = state.waiters.shift();
  if (next) next();
}

const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

/**
 * Ejecuta una petición HTTP con reintentos ante errores transitorios.
 * `parse` permite transformar la respuesta cruda (JSON o texto).
 */
export async function request<T>(
  url: string,
  options: {
    headers?: Record<string, string>;
    method?: string;
    body?: string;
    retries?: number;
    accept?: string;
    parse: (response: Response) => Promise<T>;
  },
): Promise<T> {
  const retries = options.retries ?? 2;

  for (let attempt = 0; ; attempt++) {
    await acquire(url);
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), config.timeoutMs);
      let response: Response;
      try {
        response = await fetch(url, {
          method: options.method ?? "GET",
          headers: {
            "User-Agent": config.userAgent,
            "Accept-Language": `${config.locale},${config.locale.split("-")[0]};q=0.9,en;q=0.8`,
            Accept: options.accept ?? "*/*",
            ...options.headers,
          },
          body: options.body,
          signal: controller.signal,
          redirect: "follow",
        });
      } finally {
        clearTimeout(timer);
      }

      if (!response.ok) {
        const retryable = RETRYABLE_STATUS.has(response.status) && attempt < retries;
        if (retryable) {
          await sleep(400 * 2 ** attempt);
          continue;
        }
        throw new HttpError(
          `Transfermarkt respondió ${response.status} ${response.statusText}`,
          response.status,
          url,
        );
      }

      return await options.parse(response);
    } catch (error) {
      const transient =
        error instanceof HttpError
          ? RETRYABLE_STATUS.has(error.status) && attempt < retries
          : attempt < retries;

      if (transient) {
        await sleep(400 * 2 ** attempt);
        continue;
      }
      throw error;
    } finally {
      release(url);
    }
  }
}

/** Petición JSON contra la API oficial de Transfermarkt. */
export async function getJson<T>(path: string, query?: Record<string, string | number | undefined>): Promise<T> {
  const url = new URL(path, config.apiBase);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }

  const payload = await request<unknown>(url.toString(), {
    headers: {
      Accept: "application/json",
      "X-Preferred-Context": config.context,
    },
    parse: async (response) => {
      const body = await response.json();
      // La API responde { success, message, data } y 200 también en errores de negocio.
      if (body && typeof body === "object" && "success" in body && body.success === false) {
        throw new HttpError(
          `Transfermarkt API: ${(body as { message?: string }).message ?? "error desconocido"}`,
          404,
          url.toString(),
        );
      }
      return body;
    },
  });

  return (payload as { data: T }).data;
}

/** Petición de HTML al sitio web de Transfermarkt. */
export async function getHtml(url: string): Promise<string> {
  return request<string>(url, {
    headers: {
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
    parse: async (response) => await response.text(),
  });
}
