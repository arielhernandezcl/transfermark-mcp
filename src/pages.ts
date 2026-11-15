/**
 * Descarga de las páginas de Transfermarkt que solo existen en HTML.
 * Cada función resuelve primero el slug del club/competición para construir la URL.
 */

import { TtlCache, TTL } from "./cache.ts";
import { config } from "./config.ts";
import { getHtml } from "./http.ts";
import * as html from "./html.ts";
import { api } from "./api.ts";

const pageCache = new TtlCache(TTL.live);

/** Convierte "/real-madrid/startseite/verein/418" en "real-madrid". */
function slugFromRelativeUrl(relativeUrl: string): string {
  const match = relativeUrl.match(/^\/([a-z0-9-]+)\//);
  return match?.[1] ?? "";
}

async function clubSlug(clubId: string | number): Promise<string> {
  const club = await api.getClub(clubId);
  return slugFromRelativeUrl(club.relativeUrl);
}

async function competitionSlug(competitionId: string): Promise<string> {
  const competition = await api.getCompetition(competitionId);
  return slugFromRelativeUrl(competition.relativeUrl);
}

/** Plantilla de un club. `season` es el año de inicio (2025 = temporada 25/26). */
export async function fetchSquad(clubId: string | number, season?: number): Promise<html.SquadResult> {
  const key = `squad:${clubId}:${season ?? "current"}`;
  return pageCache.resolve(key, async () => {
    const club = await api.getClub(clubId);
    const slug = slugFromRelativeUrl(club.relativeUrl);
    const seasonPart = season ? `/saison_id/${season}` : "";
    const url = `${config.webBase}/${slug}/kader/verein/${clubId}${seasonPart}`;
    return html.parseSquad(await getHtml(url), season ?? null, club.name);
  });
}

/** Temporada en curso de la liga principal de un club. */
export async function fetchClubCurrentSeason(clubId: string | number): Promise<number | null> {
  const club = await api.getClub(clubId);
  if (!club.baseDetails.primaryCompetitionId) return null;
  try {
    const competition = await api.getCompetition(club.baseDetails.primaryCompetitionId);
    return competition.currentSeasonId;
  } catch {
    return null;
  }
}

/** Clasificación de una competición. */
export async function fetchLeagueTable(competitionId: string, season?: number): Promise<html.LeagueTableResult> {
  const key = `table:${competitionId}:${season ?? "current"}`;
  return pageCache.resolve(key, async () => {
    const slug = await competitionSlug(competitionId);
    const seasonPart = season ? `/saison_id/${season}` : "";
    const url = `${config.webBase}/${slug}/tabelle/wettbewerb/${competitionId}${seasonPart}`;
    return html.parseLeagueTable(await getHtml(url), season ?? null);
  });
}

/** Ranking de valores de mercado de una competición. */
export async function fetchMarketValues(competitionId: string, season?: number): Promise<html.MarketValueResult> {
  const key = `mv:${competitionId}:${season ?? "current"}`;
  return pageCache.resolve(key, async () => {
    const slug = await competitionSlug(competitionId);
    const seasonPart = season ? `/saison_id/${season}` : "";
    const url = `${config.webBase}/${slug}/marktwerte/wettbewerb/${competitionId}${seasonPart}`;
    return html.parseMarketValues(await getHtml(url), season ?? null);
  });
}

/** Fichajes de un club (altas y bajas). */
export async function fetchClubTransfers(clubId: string | number, season?: number): Promise<html.ClubTransfersResult> {
  const key = `clubtr:${clubId}:${season ?? "current"}`;
  return pageCache.resolve(key, async () => {
    const slug = await clubSlug(clubId);
    const seasonPart = season ? `/saison_id/${season}` : "";
    const url = `${config.webBase}/${slug}/transfers/verein/${clubId}${seasonPart}`;
    return html.parseClubTransfers(await getHtml(url), season ?? null);
  });
}

/** Catálogo de competiciones disponibles en Transfermarkt. */
export async function fetchCompetitionCatalog(): Promise<html.CompetitionCatalogEntry[]> {
  return pageCache.resolve(
    "competitions:catalog",
    async () => html.parseCompetitionCatalog(await getHtml(`${config.webBase}/navigation/wettbewerbe`)),
    TTL.reference,
  );
}
