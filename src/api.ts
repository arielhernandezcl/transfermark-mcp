/**
 * Cliente de la API JSON oficial de Transfermarkt (tmapi.transfermarkt.technology).
 * Todos los métodos devuelven el campo `data` ya desenvuelto.
 */

import { TtlCache, TTL } from "./cache.ts";
import { getJson } from "./http.ts";
import type {
  ClubProfile,
  ClubTransferHistory,
  CompetitionProfile,
  LeagueTable,
  MarketValueHistory,
  NationalCareerHistory,
  PerformanceData,
  PlayerProfile,
  ReferenceData,
  SquadEntry,
  TransferHistory,
} from "./types.ts";

const cache = new TtlCache(TTL.profile);

export const api = {
  getPlayer(playerId: string | number): Promise<PlayerProfile> {
    return cache.resolve(`player:${playerId}`, () => getJson<PlayerProfile>(`/player/${playerId}`), TTL.profile);
  },

  getPlayerMarketValueHistory(playerId: string | number): Promise<MarketValueHistory> {
    return cache.resolve(`player:${playerId}:mv`, () => getJson<MarketValueHistory>(`/player/${playerId}/market-value-history`), TTL.history);
  },

  getPlayerNationalCareerHistory(playerId: string | number): Promise<NationalCareerHistory> {
    return cache.resolve(`player:${playerId}:nt`, () => getJson<NationalCareerHistory>(`/player/${playerId}/national-career-history`), TTL.history);
  },

  /** Historial completo de partidos (partido a partido) de un jugador. */
  getPlayerPerformance(playerId: string | number): Promise<PerformanceData> {
    return cache.resolve(`player:${playerId}:perf`, () => getJson<PerformanceData>(`/player/${playerId}/performance-game`), TTL.history);
  },

  getPlayerTransferHistory(playerId: string | number): Promise<TransferHistory> {
    return cache.resolve(`player:${playerId}:tr`, () => getJson<TransferHistory>(`/transfer/history/player/${playerId}`), TTL.history);
  },

  getClub(clubId: string | number): Promise<ClubProfile> {
    return cache.resolve(`club:${clubId}`, () => getJson<ClubProfile>(`/club/${clubId}`), TTL.profile);
  },

  getClubSquad(clubId: string | number): Promise<{ clubId: string; squad: SquadEntry[] }> {
    return cache.resolve(`club:${clubId}:squad`, () => getJson<{ clubId: string; squad: SquadEntry[] }>(`/club/${clubId}/squad`), TTL.live);
  },

  getClubTransferHistory(clubId: string | number): Promise<ClubTransferHistory> {
    return cache.resolve(`club:${clubId}:tr`, () => getJson<ClubTransferHistory>(`/transfer/history/club/${clubId}`), TTL.history);
  },

  getCompetition(competitionId: string): Promise<CompetitionProfile> {
    return cache.resolve(`comp:${competitionId}`, () => getJson<CompetitionProfile>(`/competition/${competitionId}`), TTL.profile);
  },

  getCompetitionTable(competitionId: string, season?: number): Promise<LeagueTable> {
    return cache.resolve(
      `comp:${competitionId}:table:${season ?? "current"}`,
      () => getJson<LeagueTable>(`/competition/${competitionId}/table`, { saison: season }),
      TTL.live,
    );
  },

  getReferenceData(): Promise<ReferenceData> {
    return cache.resolve("attributes", () => getJson<ReferenceData>("/attributes"), TTL.reference);
  },
};

export { cache as apiCache };
