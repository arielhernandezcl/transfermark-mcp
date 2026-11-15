/**
 * Resolución de identificadores a nombres legibles.
 *
 * La API de Transfermarkt devuelve ids (clubId, competitionId, playerId) en los
 * historiales y clasificaciones. Aquí se resuelven a nombres con caché para no
 * disparar una petición por cada fila.
 */

import { api } from "./api.ts";
import { TtlCache, TTL } from "./cache.ts";

const clubNames = new TtlCache(TTL.profile);
const competitionNames = new TtlCache(TTL.profile);

/** Resuelve varios ids de club en paralelo, con deduplicación. */
export async function resolveClubNames(ids: Array<string | number>): Promise<Map<string, string>> {
  const unique = [...new Set(ids.map(String))].filter((id) => id && id !== "0");
  const result = new Map<string, string>();

  await Promise.all(
    unique.map(async (id) => {
      const cached = clubNames.get(id);
      if (typeof cached === "string") {
        result.set(id, cached);
        return;
      }
      try {
        const club = await api.getClub(id);
        clubNames.set(id, club.name);
        result.set(id, club.name);
      } catch {
        result.set(id, `Club ${id}`);
      }
    }),
  );

  return result;
}

/** Resuelve varios ids de competición en paralelo. */
export async function resolveCompetitionNames(ids: Array<string | number>): Promise<Map<string, string>> {
  const unique = [...new Set(ids.map(String))].filter((id) => id && id !== "0");
  const result = new Map<string, string>();

  await Promise.all(
    unique.map(async (id) => {
      const cached = competitionNames.get(id);
      if (typeof cached === "string") {
        result.set(id, cached);
        return;
      }
      try {
        const competition = await api.getCompetition(id);
        competitionNames.set(id, competition.name);
        result.set(id, competition.name);
      } catch {
        result.set(id, id);
      }
    }),
  );

  return result;
}

/** Resuelve un único id de club. */
export async function resolveClubName(id: string | number | undefined): Promise<string | null> {
  if (!id || id === "0") return null;
  const names = await resolveClubNames([id]);
  return names.get(String(id)) ?? null;
}

/** Resuelve un único id de competición. */
export async function resolveCompetitionName(id: string | number | undefined): Promise<string | null> {
  if (!id || id === "0") return null;
  const names = await resolveCompetitionNames([id]);
  return names.get(String(id)) ?? null;
}
