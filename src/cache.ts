/**
 * Caché en memoria con TTL para no repetir peticiones a Transfermarkt.
 * Los datos de Transfermarkt cambian poco entre consultas, así que cachear
 * es clave tanto para la latencia como para no abusar del sitio.
 */

interface Entry {
  value: unknown;
  expiresAt: number;
}

export class TtlCache {
  private store = new Map<string, Entry>();
  private inflight = new Map<string, Promise<unknown>>();

  constructor(
    private readonly ttlMs: number,
    private readonly maxEntries = 500,
  ) {}

  get(key: string): unknown {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= Date.now()) {
      this.store.delete(key);
      return undefined;
    }
    // Refresca la posición para un eviction LRU.
    this.store.delete(key);
    this.store.set(key, entry);
    return entry.value;
  }

  set(key: string, value: unknown, ttlMs = this.ttlMs): void {
    if (this.store.size >= this.maxEntries) {
      const oldest = this.store.keys().next();
      if (!oldest.done) this.store.delete(oldest.value);
    }
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  /**
   * Devuelve el valor cacheado o ejecuta `factory`. Las llamadas concurrentes
   * para la misma clave comparten una sola promesa (evita ráfagas duplicadas).
   */
  async resolve<V>(key: string, factory: () => Promise<V>, ttlMs = this.ttlMs): Promise<V> {
    const cached = this.get(key);
    if (cached !== undefined) return cached as V;

    const pending = this.inflight.get(key);
    if (pending) return pending as Promise<V>;

    const promise = factory()
      .then((value) => {
        this.set(key, value, ttlMs);
        return value;
      })
      .finally(() => {
        this.inflight.delete(key);
      });

    this.inflight.set(key, promise);
    return promise;
  }

  clear(): void {
    this.store.clear();
    this.inflight.clear();
  }

  get size(): number {
    return this.store.size;
  }
}

/** TTLs por tipo de dato: lo volátil se cachea poco, lo histórico mucho. */
export const TTL = {
  /** Perfil de jugador/club: cambia rara vez. */
  profile: 6 * 60 * 60_000,
  /** Historial de fichajes y valor de mercado. */
  history: 3 * 60 * 60_000,
  /** Clasificaciones, plantillas y listados. */
  live: 30 * 60_000,
  /** Búsquedas. */
  search: 60 * 60_000,
  /** Datos de referencia (países, posiciones...). */
  reference: 24 * 60 * 60_000,
} as const;
