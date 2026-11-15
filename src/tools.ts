/**
 * Registro de herramientas MCP de Transfermarkt.
 *
 * Cada herramienta devuelve JSON estructurado como texto: es lo que mejor
 * consumen los modelos a la vez que mantiene los datos legibles.
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { api } from "./api.ts";
import { config } from "./config.ts";
import * as html from "./html.ts";
import { fetchClubCurrentSeason, fetchClubTransfers, fetchCompetitionCatalog, fetchLeagueTable, fetchMarketValues, fetchSquad } from "./pages.ts";
import { resolveClubNames, resolveCompetitionNames } from "./resolver.ts";
import type { PerformanceGame, TransferEntry } from "./types.ts";

/** Empaqueta un payload como respuesta de herramienta MCP. */
function json(payload: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
  };
}

/** Respuesta de error legible para el modelo. */
function fail(message: string, hint?: string) {
  return {
    isError: true,
    content: [{ type: "text" as const, text: hint ? `${message}\n\nSugerencia: ${hint}` : message }],
  };
}

const idSchema = z
  .union([z.string(), z.number()])
  .describe("Identificador numérico de Transfermarkt (por ejemplo 8198 para Cristiano Ronaldo).");

const seasonSchema = z
  .number()
  .int()
  .min(1950)
  .max(2100)
  .optional()
  .describe(
    "Temporada por año de inicio (2025 = 25/26, 2026 = 26/27). Si se omite, la temporada actual.",
  );

export function registerTools(server: McpServer): void {
  // -------------------------------------------------------------------------
  // Búsqueda
  // -------------------------------------------------------------------------

  server.registerTool(
    "search_players",
    {
      title: "Buscar jugadores",
      description:
        "Busca jugadores por nombre en Transfermarkt. Devuelve nombre, posición, club, edad, nacionalidad y valor de mercado, además del id numérico necesario para el resto de herramientas.",
      inputSchema: {
        query: z.string().min(2).describe("Nombre del jugador, p. ej. 'Mbappé', 'Benzema', 'Lamine Yamal'."),
        limit: z.number().int().min(1).max(50).optional().describe("Máximo de resultados (por defecto 20)."),
      },
    },
    async ({ query, limit = 20 }) => {
      try {
        const result = await html.searchHtml(query);
        if (result.players.length === 0) {
          return fail(
            `No se han encontrado jugadores para "${query}".`,
            "Prueba con otra grafía (sin tildes), con el nombre completo o con el apellido.",
          );
        }
        return json({
          query,
          total: result.players.length,
          players: result.players.slice(0, limit),
          note: "Usa el playerId resultante en get_player_profile, get_player_transfers, etc.",
        });
      } catch (error) {
        return fail(`Error buscando "${query}": ${(error as Error).message}`);
      }
    },
  );

  server.registerTool(
    "search_clubs",
    {
      title: "Buscar clubes",
      description:
        "Busca clubes por nombre en Transfermarkt. Devuelve nombre, liga, país, tamaño de plantilla y valor de mercado, con el id numérico del club.",
      inputSchema: {
        query: z.string().min(2).describe("Nombre del club, p. ej. 'Real Madrid', 'Barcelona', 'Bayern'."),
        limit: z.number().int().min(1).max(50).optional().describe("Máximo de resultados (por defecto 20)."),
      },
    },
    async ({ query, limit = 20 }) => {
      try {
        const result = await html.searchHtml(query);
        if (result.clubs.length === 0) {
          return fail(
            `No se han encontrado clubes para "${query}".`,
            "Prueba con el nombre en inglés o abreviado ('Man United', 'Inter').",
          );
        }
        return json({
          query,
          total: result.clubs.length,
          clubs: result.clubs.slice(0, limit),
          note: "Usa el clubId resultante en get_club_profile, get_club_squad, get_club_transfers.",
        });
      } catch (error) {
        return fail(`Error buscando "${query}": ${(error as Error).message}`);
      }
    },
  );

  server.registerTool(
    "search_competitions",
    {
      title: "Buscar competiciones",
      description:
        "Busca ligas y torneos en Transfermarkt. Devuelve el id de competición necesario para la clasificación o el ranking de valores (ES1 = LaLiga, GB1 = Premier League, CL = Champions League, L1 = Bundesliga, IT1 = Serie A).",
      inputSchema: {
        query: z.string().min(2).describe("Nombre de la liga o torneo, p. ej. 'Premier League', 'Champions'."),
        limit: z.number().int().min(1).max(100).optional().describe("Máximo de resultados (por defecto 30)."),
      },
    },
    async ({ query, limit = 30 }) => {
      try {
        const catalog = await fetchCompetitionCatalog();
        const needle = query.toLowerCase();
        const matches = catalog.filter(
          (entry) =>
            entry.name.toLowerCase().includes(needle) ||
            entry.country.toLowerCase().includes(needle) ||
            entry.competitionId.toLowerCase() === needle,
        );
        if (matches.length === 0) {
          return fail(
            `No se han encontrado competiciones para "${query}".`,
            "Prueba con 'LaLiga', 'Premier', 'Champions', 'Bundesliga' o 'Serie A'.",
          );
        }

        const selected = matches.slice(0, limit);
        const reference = await api.getReferenceData();
        const countryName = (id: number) => reference.countries.find((c) => c.id === id)?.name ?? null;

        // La API aporta país y temporada actual de cada competición.
        const competitions = await Promise.all(
          selected.map(async (entry) => {
            try {
              const competition = await api.getCompetition(entry.competitionId);
              return {
                competitionId: entry.competitionId,
                name: competition.name,
                country: countryName(competition.originDetails.countryId),
                currentSeason: competition.currentSeasonId,
                isOngoing: competition.baseDetails.isOngoing,
                url: entry.url,
              };
            } catch {
              return { ...entry, currentSeason: null, isOngoing: null };
            }
          }),
        );

        return json({
          query,
          total: matches.length,
          competitions,
          note: "Usa el competitionId resultante en get_competition_table o get_competition_market_values.",
        });
      } catch (error) {
        return fail(`Error buscando competiciones: ${(error as Error).message}`);
      }
    },
  );

  // -------------------------------------------------------------------------
  // Jugadores
  // -------------------------------------------------------------------------

  server.registerTool(
    "get_player_profile",
    {
      title: "Perfil de un jugador",
      description:
        "Perfil completo de un jugador: datos personales, posición, contrato, club actual, dorsales y valor de mercado actual, anterior y máximo histórico.",
      inputSchema: {
        playerId: idSchema,
      },
    },
    async ({ playerId }) => {
      try {
        const player = await api.getPlayer(playerId);
        const clubNames = await resolveClubNames(player.clubAssignments.map((c) => c.clubId));
        const reference = await api.getReferenceData();
        const countryName = (id: number) => reference.countries.find((c) => c.id === id)?.name ?? null;

        return json({
          id: player.id,
          name: player.name,
          fullName: player.displayName,
          dateOfBirth: player.lifeDates.dateOfBirth,
          age: player.lifeDates.age,
          placeOfBirth: player.birthPlaceDetails.placeOfBirth,
          countryOfBirth: countryName(player.birthPlaceDetails.countryOfBirthId),
          nationality: countryName(player.nationalityDetails.nationalities.nationalityId),
          secondNationality: player.nationalityDetails.nationalities.secondNationalityId
            ? countryName(player.nationalityDetails.nationalities.secondNationalityId)
            : null,
          height: player.attributes.height ? `${player.attributes.height} m` : null,
          position: player.attributes.position?.name ?? null,
          positionGroup: player.attributes.positionGroupName,
          sidePositions: [
            player.attributes.firstSidePosition?.name,
            player.attributes.secondSidePosition?.name,
          ].filter(Boolean),
          preferredFoot: player.attributes.preferredFoot?.name ?? null,
          outfitter: player.attributes.outfitter?.name ?? null,
          agency: player.attributes.consultantAgency?.name ?? null,
          contractUntil: player.attributes.contractUntil,
          currentClub: player.clubAssignments.find((c) => c.type === "current")
            ? {
                clubId: player.clubAssignments.find((c) => c.type === "current")!.clubId,
                club: clubNames.get(String(player.clubAssignments.find((c) => c.type === "current")!.clubId)) ?? null,
                shirtNumber: player.clubAssignments.find((c) => c.type === "current")!.shirtNumber,
                isCaptain: player.clubAssignments.find((c) => c.type === "current")!.isCaptain,
                since: player.clubAssignments.find((c) => c.type === "current")!.start,
              }
            : null,
          marketValue: {
            current: player.marketValueDetails.current?.compact
              ? `${player.marketValueDetails.current.compact.prefix}${player.marketValueDetails.current.compact.content}${player.marketValueDetails.current.compact.suffix}`
              : null,
            currentAmount: player.marketValueDetails.current?.value ?? null,
            previous: player.marketValueDetails.previous?.compact
              ? `${player.marketValueDetails.previous.compact.prefix}${player.marketValueDetails.previous.compact.content}${player.marketValueDetails.previous.compact.suffix}`
              : null,
            change: player.marketValueDetails.delta?.percentage ?? null,
            highest: player.marketValueDetails.highest?.compact
              ? `${player.marketValueDetails.highest.compact.prefix}${player.marketValueDetails.highest.compact.content}${player.marketValueDetails.highest.compact.suffix}`
              : null,
            highestDate: player.marketValueDetails.highest?.determined ?? null,
          },
          youthClubs: player.attributes.formerClubsNote || null,
          portrait: player.portraitUrl,
          url: `${config.webBase}${player.relativeUrl}`,
        });
      } catch (error) {
        return fail(
          `No se ha podido obtener el perfil del jugador "${playerId}": ${(error as Error).message}`,
          "Comprueba el id con search_players.",
        );
      }
    },
  );

  server.registerTool(
    "get_player_transfers",
    {
      title: "Historial de fichajes de un jugador",
      description:
        "Historial completo de fichajes de un jugador: de dónde viene, a dónde va, fecha, coste, valor de mercado en el momento y duración del contrato.",
      inputSchema: {
        playerId: idSchema,
      },
    },
    async ({ playerId }) => {
      try {
        const history = await api.getPlayerTransferHistory(playerId);
        const clubIds = history.clubIds ?? [];
        const [clubNames, competitionNames] = await Promise.all([
          resolveClubNames(clubIds),
          resolveCompetitionNames(history.competitionIds ?? []),
        ]);

        const format = (entry: TransferEntry) => {
          const from = entry.transferSource;
          const to = entry.transferDestination;
          return {
            date: entry.details.date.slice(0, 10),
            season: entry.details.season.display,
            from: from.clubId && from.clubId !== "0"
              ? { clubId: from.clubId, club: clubNames.get(String(from.clubId)) ?? null }
              : null,
            to: to.clubId && to.clubId !== "0"
              ? { clubId: to.clubId, club: clubNames.get(String(to.clubId)) ?? null }
              : null,
            fee: entry.details.fee?.compact
              ? `${entry.details.fee.compact.prefix}${entry.details.fee.compact.content}${entry.details.fee.compact.suffix}`
              : null,
            feeAmount: entry.details.fee?.value ?? null,
            marketValueAtTransfer: entry.details.marketValue?.compact
              ? `${entry.details.marketValue.compact.prefix}${entry.details.marketValue.compact.content}${entry.details.marketValue.compact.suffix}`
              : null,
            age: entry.details.age,
            contractUntil: entry.details.contractUntilDate?.slice(0, 10) ?? null,
            type: entry.typeDetails.type,
            description: entry.typeDetails.feeDescription || null,
            url: `${config.webBase}${entry.relativeUrl}`,
          };
        };

        return json({
          playerId: history.playerId,
          totalTransfers: history.history.terminated.length,
          pendingTransfers: history.history.pending.length,
          totalFees: history.history.feeSum?.compact
            ? `${history.history.feeSum.compact.prefix}${history.history.feeSum.compact.content}${history.history.feeSum.compact.suffix}`
            : null,
          totalFeesAmount: history.history.feeSum?.value ?? null,
          currentMarketValue: history.history.totalMarketValue?.compact
            ? `${history.history.totalMarketValue.compact.prefix}${history.history.totalMarketValue.compact.content}${history.history.totalMarketValue.compact.suffix}`
            : null,
          mostRecentTransfer: history.mostRecentTransfer ? format(history.mostRecentTransfer) : null,
          transfers: history.history.terminated.map(format),
          pending: history.history.pending.map(format),
          competitions: [...competitionNames.entries()].map(([id, name]) => ({ id, name })),
        });
      } catch (error) {
        return fail(
          `No se ha podido obtener el historial de fichajes de "${playerId}": ${(error as Error).message}`,
          "Comprueba el id con search_players.",
        );
      }
    },
  );

  server.registerTool(
    "get_player_market_value",
    {
      title: "Evolución del valor de mercado",
      description:
        "Evolución histórica del valor de mercado de un jugador: valor por temporada, club en el que estaba y edad. Incluye el pico histórico.",
      inputSchema: {
        playerId: idSchema,
      },
    },
    async ({ playerId }) => {
      try {
        const history = await api.getPlayerMarketValueHistory(playerId);
        const clubNames = await resolveClubNames(history.clubIds ?? []);

        const points = history.history.map((entry) => ({
          season: html.seasonLabel(entry.seasonId),
          date: entry.marketValue.determined?.slice(0, 10) ?? null,
          clubId: entry.clubId,
          club: clubNames.get(String(entry.clubId)) ?? null,
          age: entry.age,
          value: entry.marketValue.value,
          valueFormatted: `${entry.marketValue.compact.prefix}${entry.marketValue.compact.content}${entry.marketValue.compact.suffix}`,
        }));

        type ValuePoint = {
          season: string;
          date: string | null;
          clubId: string;
          club: string | null;
          age: number;
          value: number | null;
          valueFormatted: string;
        };

        const peak = points.reduce<ValuePoint>(
          (best, point) =>
            point.value !== null && (best.value === null || point.value > best.value) ? point : best,
          {
            season: "",
            date: null,
            clubId: "",
            club: null,
            age: 0,
            value: null,
            valueFormatted: "",
          },
        );

        return json({
          playerId,
          currentValue: history.current?.marketValue?.value ?? null,
          currentValueFormatted: history.current?.marketValue?.compact
            ? `${history.current.marketValue.compact.prefix}${history.current.marketValue.compact.content}${history.current.marketValue.compact.suffix}`
            : null,
          currentValueDate: history.current?.marketValue?.determined?.slice(0, 10) ?? null,
          peak: peak.value !== null ? peak : null,
          history: points,
        });
      } catch (error) {
        return fail(
          `No se ha podido obtener la evolución de valor de "${playerId}": ${(error as Error).message}`,
          "Comprueba el id con search_players.",
        );
      }
    },
  );

  server.registerTool(
    "get_player_performance",
    {
      title: "Estadísticas de partidos de un jugador",
      description:
        "Estadísticas partido a partido de un jugador (goles, asistencias, minutos, tarjetas, tiros). Por defecto devuelve agregados por temporada y por competición; con detail='matches' devuelve los partidos individuales.",
      inputSchema: {
        playerId: idSchema,
        season: z
          .number()
          .int()
          .min(1950)
          .max(2100)
          .optional()
          .describe("Filtra por temporada (año de inicio, p. ej. 2025 = 25/26)."),
        competitionId: z
          .string()
          .optional()
          .describe("Filtra por competición (p. ej. 'ES1' para LaLiga, 'CL' para Champions)."),
        detail: z
          .enum(["summary", "matches"])
          .optional()
          .describe("'summary' (por defecto) agrega por temporada y competición; 'matches' lista los partidos."),
        limit: z.number().int().min(1).max(200).optional().describe("Máximo de partidos devueltos (por defecto 30)."),
      },
    },
    async ({ playerId, season, competitionId, detail = "summary", limit = 30 }) => {
      try {
        const data = await api.getPlayerPerformance(playerId);

        let games: PerformanceGame[] = data.performance;
        if (season !== undefined) {
          games = games.filter((game) => game.gameInformation.seasonId === season);
        }
        if (competitionId) {
          games = games.filter((game) => game.gameInformation.competitionId === competitionId);
        }

        const played = games.filter((game) => game.statistics.generalStatistics.participationState === "played");

        const clubNames = await resolveClubNames([
          ...data.clubIds,
          ...games.flatMap((game) => [game.clubsInformation.club.clubId, game.clubsInformation.opponent.clubId]),
        ]);
        const competitionNames = await resolveCompetitionNames([
          ...data.competitionIds,
          ...games.map((game) => game.gameInformation.competitionId),
        ]);

        const num = (value: number | null | undefined): number => (typeof value === "number" ? value : 0);

        const aggregate = (subset: PerformanceGame[]) => {
          const playedGames = subset.filter((game) => game.statistics.generalStatistics.participationState === "played");
          return {
            matches: playedGames.length,
            starts: playedGames.filter((game) => game.statistics.playingTimeStatistics?.isStarting).length,
            minutes: playedGames.reduce((sum, game) => sum + num(game.statistics.playingTimeStatistics?.playedMinutes), 0),
            goals: playedGames.reduce((sum, game) => sum + num(game.statistics.goalStatistics.goalsScoredTotal), 0),
            assists: playedGames.reduce((sum, game) => sum + num(game.statistics.goalStatistics.assists), 0),
            yellowCards: playedGames.reduce((sum, game) => sum + num(game.statistics.cardStatistics?.yellowCardNet), 0),
            redCards: playedGames.reduce((sum, game) => sum + num(game.statistics.cardStatistics?.redCard), 0),
            cleanSheets: playedGames.filter((game) => num(game.clubsInformation.club.opponentGoalsTotal) === 0).length,
          };
        };

        if (detail === "matches") {
          const matches = [...games]
            .sort((a, b) => b.gameInformation.date.dateTimeUTC.localeCompare(a.gameInformation.date.dateTimeUTC))
            .slice(0, limit)
            .map((game) => ({
              date: game.gameInformation.date.dateTimeUTC.slice(0, 10),
              season: game.gameInformation.season.display,
              competition: competitionNames.get(game.gameInformation.competitionId) ?? game.gameInformation.competitionId,
              competitionId: game.gameInformation.competitionId,
              gameDay: game.gameInformation.gameDay,
              venue: game.clubsInformation.club.venue,
              club: {
                clubId: game.clubsInformation.club.clubId,
                name: clubNames.get(game.clubsInformation.club.clubId) ?? null,
                goals: game.clubsInformation.club.goalsTotal,
              },
              opponent: {
                clubId: game.clubsInformation.opponent.clubId,
                name: clubNames.get(game.clubsInformation.opponent.clubId) ?? null,
                goals: game.clubsInformation.opponent.goalsTotal,
              },
              result:
                game.clubsInformation.club.goalsTotal > game.clubsInformation.opponent.goalsTotal
                  ? "V"
                  : game.clubsInformation.club.goalsTotal < game.clubsInformation.opponent.goalsTotal
                    ? "D"
                    : "E",
              participation: game.statistics.generalStatistics.participationState,
              minutes: game.statistics.playingTimeStatistics?.playedMinutes ?? null,
              started: game.statistics.playingTimeStatistics?.isStarting ?? null,
              goals: game.statistics.goalStatistics.goalsScoredTotal,
              assists: game.statistics.goalStatistics.assists,
              shots: game.statistics.goalStatistics.scoringAttempts,
              yellowCards: game.statistics.cardStatistics?.yellowCardNet ?? null,
              redCards: game.statistics.cardStatistics?.redCard ?? null,
            }));

          return json({
            playerId: String(playerId),
            season: season ?? null,
            competitionId: competitionId ?? null,
            totalGamesInScope: games.length,
            totalPlayed: played.length,
            summary: aggregate(games),
            matches,
          });
        }

        const bySeason = new Map<number, PerformanceGame[]>();
        for (const game of games) {
          const key = game.gameInformation.seasonId;
          bySeason.set(key, [...(bySeason.get(key) ?? []), game]);
        }

        const byCompetition = new Map<string, PerformanceGame[]>();
        for (const game of games) {
          const key = game.gameInformation.competitionId;
          byCompetition.set(key, [...(byCompetition.get(key) ?? []), game]);
        }

        return json({
          playerId: String(playerId),
          season: season ?? null,
          competitionId: competitionId ?? null,
          totalGamesInScope: games.length,
          totalPlayed: played.length,
          overall: aggregate(games),
          bySeason: [...bySeason.entries()]
            .sort((a, b) => b[0] - a[0])
            .map(([seasonId, subset]) => ({
              season: html.seasonLabel(seasonId),
              ...aggregate(subset),
            })),
          byCompetition: [...byCompetition.entries()]
            .map(([id, subset]) => ({
              competitionId: id,
              competition: competitionNames.get(id) ?? id,
              ...aggregate(subset),
            }))
            .sort((a, b) => b.matches - a.matches),
        });
      } catch (error) {
        return fail(
          `No se han podido obtener las estadísticas de "${playerId}": ${(error as Error).message}`,
          "Comprueba el id con search_players.",
        );
      }
    },
  );

  server.registerTool(
    "get_player_national_team",
    {
      title: "Historial con la selección nacional",
      description:
        "Partidos y goles con la selección nacional de un jugador, por selección y por tournament.",
      inputSchema: {
        playerId: idSchema,
      },
    },
    async ({ playerId }) => {
      try {
        const history = await api.getPlayerNationalCareerHistory(playerId);
        const teamNames = await resolveClubNames(history.history.map((entry) => entry.clubId));

        return json({
          playerId: String(playerId),
          totalGames: history.history.reduce((sum, entry) => sum + entry.gamesPlayed, 0),
          totalGoals: history.history.reduce((sum, entry) => sum + entry.goalsScored, 0),
          entries: history.history.map((entry) => ({
            nationalTeamId: entry.clubId,
            nationalTeam: teamNames.get(String(entry.clubId)) ?? null,
            gamesPlayed: entry.gamesPlayed,
            goalsScored: entry.goalsScored,
            shirtNumber: entry.shirtNumber,
            isCaptain: entry.isCaptain,
            debut: entry.debut,
            lastGame: entry.lastGame,
            careerState: entry.careerState,
          })),
        });
      } catch (error) {
        return fail(`No se ha podido obtener el historial de selección de "${playerId}": ${(error as Error).message}`);
      }
    },
  );

  // -------------------------------------------------------------------------
  // Clubes
  // -------------------------------------------------------------------------

  server.registerTool(
    "get_club_profile",
    {
      title: "Perfil de un club",
      description:
        "Datos de un club: liga, ciudad, colores, abbreviation, tamaño de plantilla, edad media y valores de mercado (total, media y de los 18 más caros).",
      inputSchema: {
        clubId: idSchema,
      },
    },
    async ({ clubId }) => {
      try {
        const club = await api.getClub(clubId);
        const reference = await api.getReferenceData();
        const countryName = (id: number) => reference.countries.find((c) => c.id === id)?.name ?? null;
        const competition = club.relevantCompetitionId
          ? await api.getCompetition(club.relevantCompetitionId).catch(() => null)
          : null;

        const format = (amount: { compact?: { prefix: string; content: string; suffix: string } } | null) =>
          amount?.compact
            ? `${amount.compact.prefix}${amount.compact.content}${amount.compact.suffix}`
            : null;

        return json({
          id: club.id,
          name: club.name,
          shortName: club.baseDetails.shortName,
          abbreviation: club.baseDetails.abbreviation,
          country: countryName(club.baseDetails.countryId),
          league: competition?.name ?? club.relevantCompetitionId,
          leagueId: club.relevantCompetitionId,
          city: club.baseDetails.superiorClub?.location.city ?? null,
          stadium: club.baseDetails.superiorClub?.location.street ?? null,
          colors: club.baseDetails.superiorClub?.colors ?? null,
          squadSize: club.squadDetails.squadSize,
          averageAge: club.squadDetails.averageAge,
          averageAgeDisplay: club.squadDetails.averageAgeDisplay,
          marketValue: {
            total: format(club.squadDetails.currentMarketValue),
            average: format(club.squadDetails.averageMarketValue),
            top18: format(club.squadDetails.top18PlayersMarketValue),
            top18Share: club.squadDetails.top18SharePercentage.display,
            acquisitionTotal: format(club.squadDetails.acquisitionValue),
          },
          crest: club.crestUrl,
          url: `${config.webBase}${club.relativeUrl}`,
        });
      } catch (error) {
        return fail(
          `No se ha podido obtener el perfil del club "${clubId}": ${(error as Error).message}`,
          "Comprueba el id con search_clubs.",
        );
      }
    },
  );

  server.registerTool(
    "get_club_squad",
    {
      title: "Plantilla de un club",
      description:
        "Plantilla completa de un club con dorsal, posición, edad, nacionalidad y valor de mercado de cada jugador. Admite consultar temporadas históricas.",
      inputSchema: {
        clubId: idSchema,
        season: seasonSchema,
        limit: z.number().int().min(1).max(100).optional().describe("Máximo de jugadores devueltos (por defecto todos)."),
      },
    },
    async ({ clubId, season, limit }) => {
      try {
        const squad = await fetchSquad(clubId, season);
        if (squad.players.length === 0) {
          return fail(
            `No se ha podido obtener la plantilla del club "${clubId}".`,
            "Comprueba el id con search_clubs.",
          );
        }
        const players = limit ? squad.players.slice(0, limit) : squad.players;

        // La cabecera de la página muestra siempre los datos de la temporada
        // actual, aunque se pidan Plantillas históricas.
        const currentSeason = await fetchClubCurrentSeason(clubId);
        const isHistorical = season !== undefined && currentSeason !== null && season !== currentSeason;

        return json({
          clubId: String(clubId),
          season: squad.season,
          squadSize: squad.squadSize,
          averageAge: squad.averageAge,
          totalMarketValue: squad.totalMarketValue,
          playerCount: players.length,
          ...(isHistorical
            ? {
                note: `squadSize, averageAge y totalMarketValue corresponden a la temporada actual (${currentSeason}), no a la histórica consultada.`,
              }
            : {}),
          players,
        });
      } catch (error) {
        return fail(`No se ha podido obtener la plantilla del club "${clubId}": ${(error as Error).message}`);
      }
    },
  );

  server.registerTool(
    "get_club_transfers",
    {
      title: "Fichajes de un club",
      description:
        "Altas y bajas de un club por temporada, con jugador, edad, nacionalidad, club de origen/destino y coste de la operación.",
      inputSchema: {
        clubId: idSchema,
        season: seasonSchema,
      },
    },
    async ({ clubId, season }) => {
      try {
        const transfers = await fetchClubTransfers(clubId, season);
        if (transfers.arrivals.length === 0 && transfers.departures.length === 0) {
          return fail(
            `No se han encontrado fichajes para el club "${clubId}"${season ? ` en la temporada ${season}` : ""}.`,
            "Comprueba el id con search_clubs o prueba otra temporada.",
          );
        }
        return json({
          clubId: String(clubId),
          season: transfers.season,
          arrivals: {
            count: transfers.arrivals.length,
            totalFee: transfers.arrivalsFeeSum,
            players: transfers.arrivals,
          },
          departures: {
            count: transfers.departures.length,
            totalFee: transfers.departuresFeeSum,
            players: transfers.departures,
          },
        });
      } catch (error) {
        return fail(`No se han podido obtener los fichajes del club "${clubId}": ${(error as Error).message}`);
      }
    },
  );

  // -------------------------------------------------------------------------
  // Competiciones
  // -------------------------------------------------------------------------

  server.registerTool(
    "get_competition_table",
    {
      title: "Clasificación de una competición",
      description:
        "Tabla de posiciones de una liga o torneo: posición, equipo, partidos jugados, ganados, empatados, perdidos, goles, diferencia y puntos.",
      inputSchema: {
        competitionId: z.string().describe("Id de competición (p. ej. 'ES1' LaLiga, 'GB1' Premier League, 'CL' Champions)."),
        season: seasonSchema,
      },
    },
    async ({ competitionId, season }) => {
      try {
        const table = await fetchLeagueTable(competitionId, season);
        if (table.rows.length === 0) {
          return fail(
            `No se ha podido obtener la clasificación de "${competitionId}".`,
            "Usa search_competitions para comprobar el id.",
          );
        }
        return json({
          competitionId,
          season: table.season,
          teams: table.rows.length,
          table: table.rows,
        });
      } catch (error) {
        return fail(`No se ha podido obtener la clasificación de "${competitionId}": ${(error as Error).message}`);
      }
    },
  );

  server.registerTool(
    "get_competition_market_values",
    {
      title: "Ranking de valores de mercado",
      description:
        "Jugadores más valiosos de una competición, ordenados por valor de mercado, con posición, edad, club y valor.",
      inputSchema: {
        competitionId: z.string().describe("Id de competición (p. ej. 'ES1', 'GB1', 'CL')."),
        season: seasonSchema,
        limit: z.number().int().min(1).max(200).optional().describe("Máximo de jugadores (por defecto 25)."),
      },
    },
    async ({ competitionId, season, limit = 25 }) => {
      try {
        const ranking = await fetchMarketValues(competitionId, season);
        if (ranking.players.length === 0) {
          return fail(
            `No se ha podido obtener el ranking de valores de "${competitionId}".`,
            "Usa search_competitions para comprobar el id.",
          );
        }
        return json({
          competitionId,
          season: ranking.season,
          totalMarketValue: ranking.totalMarketValue,
          totalPlayers: ranking.players.length,
          players: ranking.players.slice(0, limit),
        });
      } catch (error) {
        return fail(
          `No se ha podido obtener el ranking de valores de "${competitionId}": ${(error as Error).message}`,
        );
      }
    },
  );

  server.registerTool(
    "get_competition_profile",
    {
      title: "Perfil de una competición",
      description:
        "Datos de una liga o torneo: temporada actual, país, confederación, número de jornadas, valor de mercado total y si está en curso.",
      inputSchema: {
        competitionId: z.string().describe("Id de competición (p. ej. 'ES1', 'GB1', 'CL')."),
      },
    },
    async ({ competitionId }) => {
      try {
        const competition = await api.getCompetition(competitionId);
        const reference = await api.getReferenceData();
        const country = reference.countries.find((c) => c.id === competition.originDetails.countryId);

        return json({
          id: competition.id,
          name: competition.name,
          shortName: competition.shortName,
          currentSeason: competition.currentSeasonId,
          country: country?.name ?? null,
          confederationId: competition.originDetails.confederationId,
          totalMarketValue: competition.totalMarketValue?.compact
            ? `${competition.totalMarketValue.compact.prefix}${competition.totalMarketValue.compact.content}${competition.totalMarketValue.compact.suffix}`
            : null,
          gameDayCount: competition.baseDetails.gameDayCount,
          currentGameDay: competition.baseDetails.closestGameDay,
          isOngoing: competition.baseDetails.isOngoing,
          isTournament: competition.baseDetails.isTournament,
          url: `${config.webBase}${competition.relativeUrl}`,
        });
      } catch (error) {
        return fail(`No se ha podido obtener la competición "${competitionId}": ${(error as Error).message}`);
      }
    },
  );

  // -------------------------------------------------------------------------
  // Datos de referencia
  // -------------------------------------------------------------------------

  server.registerTool(
    "get_reference_data",
    {
      title: "Datos de referencia",
      description:
        "Catálogos de Transfermarkt: países y federaciones, posiciones, tipos de lesión, motivos de ausencia, fabricantes de material, tipos de contrato y roles. Útil para traducir ids a nombres.",
      inputSchema: {
        type: z
          .enum(["countries", "positions", "injuries", "absences", "outfitters", "contracts", "confederations", "all"])
          .optional()
          .describe("Qué catálogo devolver. Por defecto 'countries'."),
        query: z
          .string()
          .optional()
          .describe("Filtro de texto sobre el nombre (p. ej. 'Spain', 'Spain', 'Centre-Forward')."),
      },
    },
    async ({ type = "countries", query }) => {
      try {
        const reference = await api.getReferenceData();
        const catalogs: Record<string, unknown[]> = {
          countries: reference.countries,
          positions: reference.positions,
          injuries: reference.injuries,
          absences: reference.absences,
          outfitters: reference.outfitters,
          contracts: reference.contracts,
          confederations: reference.confederations,
        };

        if (type === "all") {
          return json({
            countries: reference.countries.length,
            positions: reference.positions,
            confederations: reference.confederations,
            injuries: reference.injuries.length,
            absences: reference.absences.length,
            outfitters: reference.outfitters,
            contracts: reference.contracts.length,
          });
        }

        const entries = catalogs[type] ?? [];
        const filtered = query
          ? entries.filter((entry) =>
              JSON.stringify(entry).toLowerCase().includes(query.toLowerCase()),
            )
          : entries;

        return json({ type, total: filtered.length, entries: filtered });
      } catch (error) {
        return fail(`No se han podido obtener los datos de referencia: ${(error as Error).message}`);
      }
    },
  );
}
