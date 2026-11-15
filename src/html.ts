/**
 * Parsers del HTML público de Transfermarkt.
 *
 * La API oficial cubre perfiles e historiales, pero la búsqueda, las plantillas,
 * las clasificaciones y los rankings de valor de mercado solo existen en el
 * HTML renderizado en servidor, así que se extraen aquí con cheerio.
 */

import * as cheerio from "cheerio";
import { config } from "./config.ts";
import { getHtml } from "./http.ts";

type Cheerio = cheerio.CheerioAPI;

/** Colapsa espacios y quita saltos de línea sobrantes. */
export function normalize(value: string | undefined | null): string {
  if (!value) return "";
  return value.replace(/\s+/g, " ").trim();
}

/** Texto normalizado de un elemento. */
export function text($: Cheerio, selector: string): string {
  const node = $(selector).first();
  return normalize(node.text());
}

/**
 * Nacionalidades de una celda: las banderas se marcan con la clase
 * "flaggenrahmen". Un jugador puede tener varias (doble nacionalidad).
 */
export function flagNames($cell: cheerio.Cheerio<any> | undefined): string[] {
  if (!$cell || $cell.length === 0) return [];
  const names: string[] = [];
  $cell
    .find("img.flaggenrahmen")
    .each((_, node) => {
      const attribs = (node as unknown as { attribs?: Record<string, string> }).attribs ?? {};
      const name = normalize(attribs.alt ?? attribs.title ?? "");
      if (name) names.push(name);
    });
  return names;
}

/** Nombre de una celda de bandera: la primera bandera si hay varias. */
export function firstFlagName($cell: cheerio.Cheerio<any> | undefined): string {
  return flagNames($cell)[0] ?? "";
}

/** Escudo de un club dentro de una celda (imagen que no es bandera ni retrato). */
export function crestName($cell: cheerio.Cheerio<any> | undefined): string {
  if (!$cell || $cell.length === 0) return "";
  let name = "";
  $cell.find("img").each((_, node) => {
    if (name) return;
    const element = node as unknown as {
      attribs?: Record<string, string>;
      attribsClass?: string[];
    };
    const attribs = element.attribs ?? {};
    const classes = element.attribsClass ?? [];
    if (classes.includes("flaggenrahmen")) return;
    if (classes.includes("bilderrahmen-fixed")) return;
    name = normalize(attribs.alt ?? attribs.title ?? "");
  });
  return name;
}

/** Convierte "10.00" + "M" en el número 10_000_000. */
export function parseCompactAmount(content: string, suffix: string): number | null {
  const normalized = content.replace(/\./g, "").replace(",", ".").trim();
  const value = Number.parseFloat(normalized);
  if (!Number.isFinite(value)) return null;
  switch (suffix.toUpperCase()) {
    case "K":
      return value * 1_000;
    case "M":
      return value * 1_000_000;
    case "B":
      return value * 1_000_000_000;
    default:
      return value;
  }
}

/** Extrae el id numérico de una URL de Transfermarkt. */
export function idFromHref(href: string | undefined, kind: "spieler" | "verein" | "wettbewerb"): string | null {
  if (!href) return null;
  const match = href.match(new RegExp(`/${kind}/(\\d+)`));
  return match ? match[1]! : null;
}

/** Deriva un nombre legible a partir del slug de una URL. */
export function nameFromSlug(href: string | undefined): string {
  if (!href) return "";
  const match = href.match(/\/([a-z0-9-]+)\/(profil\/spieler|startseite\/verein|wettbewerb)/);
  const slug = match?.[1] ?? "";
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

/**
 * Convierte el id de temporada (año de inicio, p. ej. 2026) en la etiqueta
 * habitual de Transfermarkt ("26/27").
 */
export function seasonLabel(seasonId: number): string {
  const start = String(seasonId).slice(-2);
  const end = String((seasonId + 1) % 100).padStart(2, "0");
  return `${start}/${end}`;
}

// ---------------------------------------------------------------------------
// Búsqueda rápida
// ---------------------------------------------------------------------------

export interface SearchPlayerHit {
  playerId: string;
  name: string;
  position: string;
  club: string;
  clubId: string | null;
  age: string;
  nationality: string;
  marketValue: string;
  agent: string;
  url: string;
}

export interface SearchClubHit {
  clubId: string;
  name: string;
  league: string;
  country: string;
  squadSize: string;
  marketValue: string;
  url: string;
}

export interface SearchResult {
  players: SearchPlayerHit[];
  clubs: SearchClubHit[];
}

const SEARCH_URL = `${config.webBase}/schnellsuche/ergebnis/schnellsuche?query=`;

export async function searchHtml(query: string): Promise<SearchResult> {
  const html = await getHtml(`${SEARCH_URL}${encodeURIComponent(query)}`);
  const $ = cheerio.load(html);
  const result: SearchResult = { players: [], clubs: [] };
  const seenPlayers = new Set<string>();
  const seenClubs = new Set<string>();

  $("table.items").each((_, table) => {
    const $table = $(table);
    const body = $table.find("tbody").first();
    if (body.length === 0) return;

    body.find("tr").each((__, row) => {
      const $row = $(row);
      // Solo celdas propias de la fila: las tablas inline de Transfermarkt
      // contienen <td> anidados que romperían los índices.
      const cells = $row.children("td, th").toArray().map((cell) => $(cell));
      if (cells.length === 0) return;

      const playerLink = $row.find('a[href*="/profil/spieler/"]').first();
      if (playerLink.length > 0) {
        // La tabla de jugadores tiene 7 columnas; el resto de tablas no.
        if (cells.length < 7) return;
        const href = playerLink.attr("href") ?? "";
        const playerId = idFromHref(href, "spieler");
        if (!playerId || seenPlayers.has(playerId)) return;
        seenPlayers.add(playerId);

        const clubLink = $row.find('a[href*="/startseite/verein/"]').first();
        result.players.push({
          playerId,
          name: normalize(playerLink.attr("title") ?? playerLink.text()),
          position: normalize(cells[1]?.text() ?? ""),
          club: normalize(clubLink.attr("title") ?? ""),
          clubId: idFromHref(clubLink.attr("href"), "verein"),
          age: normalize(cells[3]?.text() ?? ""),
          nationality: flagNames(cells[4]!).join(" / "),
          marketValue: normalize(cells[5]?.text() ?? ""),
          agent: normalize(cells[6]?.text() ?? ""),
          url: `${config.webBase}${href}`,
        });
        return;
      }

      const clubLink = $row.find('a[href*="/startseite/verein/"]').first();
      if (clubLink.length > 0) {
        // La tabla de clubes tiene 8 columnas (la última es el foro).
        if (cells.length < 5) return;
        const href = clubLink.attr("href") ?? "";
        const clubId = idFromHref(href, "verein");
        if (!clubId || seenClubs.has(clubId)) return;
        seenClubs.add(clubId);

        const leagueLink = $row.find('a[href*="/wettbewerb/"]').first();
        result.clubs.push({
          clubId,
          name: crestName(cells[0]!) || normalize(clubLink.attr("title") ?? clubLink.text()),
          league: normalize(leagueLink.text()),
          country: firstFlagName(cells[2]!),
          squadSize: normalize(cells[3]?.text() ?? ""),
          marketValue: normalize(cells[4]?.text() ?? ""),
          url: `${config.webBase}${href}`,
        });
      }
    });
  });

  return result;
}

// ---------------------------------------------------------------------------
// Plantilla de un club
// ---------------------------------------------------------------------------

export interface SquadRow {
  playerId: string;
  name: string;
  position: string;
  shirtNumber: string;
  age: string;
  nationality: string;
  club: string;
  marketValue: string;
  url: string;
}

export interface SquadResult {
  season: number | null;
  squadSize: number | null;
  averageAge: string | null;
  totalMarketValue: string | null;
  players: SquadRow[];
}
/**
 * Resumen de la cabecera de una página de club o competición.
 * La web lopaint en una lista de <li class="data-header__label"> con el valor
 * en un <span class="data-header__content"> anidado.
 */
export interface HeaderSummary {
  items: Array<{ label: string; value: string }>;
  totalMarketValue: string | null;
}

export function parseHeaderSummary($: Cheerio): HeaderSummary {
  const items: Array<{ label: string; value: string }> = [];

  $("li.data-header__label").each((_, node) => {
    const $node = $(node);
    const content = $node.find(".data-header__content").first();
    const value = normalize(content.text());
    const label = normalize($node.text().replace(value, "")).replace(/[:\s]+$/, "");
    if (label) items.push({ label, value });
  });

  const marketValueWrapper = $("a.data-header__market-value-wrapper").first();
  const totalMarketValue = marketValueWrapper.length
    ? normalize(marketValueWrapper.text()).replace(/Valor de mercado total/i, "").trim() || null
    : null;

  return { items, totalMarketValue };
}

/** Extrae la temporada mostrada en la página (p. ej. "25/26" -> 2025). */
function seasonFromTitle(title: string): number | null {
  const match = title.match(/(\d{2})\/(\d{2})/);
  if (!match) return null;
  return 2000 + Number.parseInt(match[1]!, 10);
}

/**
 * Extrae la temporada del parámetro saison_id de los enlaces de la página.
 * Es más fiable que el título, cuyo formato de temporada cambia por idioma.
 */
function seasonFromLinks($root: cheerio.Cheerio<any>, selector: string): number | null {
  const href = $root.find(selector).first().attr("href") ?? "";
  const match = href.match(/saison_id\/(\d{4})/);
  return match ? Number.parseInt(match[1]!, 10) : null;
}

export async function parseSquad(
  html: string,
  fallbackSeason: number | null,
  defaultClub = "",
): Promise<SquadResult> {
  const $ = cheerio.load(html);
  const title = normalize($("title").text());
  const season =
    seasonFromTitle(title) ?? seasonFromLinks($("body"), 'a[href*="saison_id"]') ?? fallbackSeason;

  const players: SquadRow[] = [];
  const table = $("table.items").first();
  const body = table.find("tbody").first();

  body.find("tr").each((_, row) => {
    const $row = $(row);
    const cells = $row.children("td, th").toArray().map((cell) => $(cell));
    if (cells.length < 3) return;

    const playerLink = $row.find('a[href*="/profil/spieler/"]').first();
    if (playerLink.length === 0) return;
    const href = playerLink.attr("href") ?? "";
    const playerId = idFromHref(href, "spieler");
    if (!playerId) return;

    const infoCell = cells[1]!;
    // La posición vive en la segunda fila de la tabla inline del jugador.
    const position = normalize(infoCell.find("table.inline-table tr").eq(1).text());

    players.push({
      playerId,
      name: normalize(playerLink.attr("title") ?? playerLink.text()),
      position,
      shirtNumber: normalize(cells[0]?.text() ?? ""),
      age: normalize(cells[2]?.text() ?? ""),
      nationality: flagNames(cells[3]!).join(" / "),
      club: crestName(cells[4]!) || defaultClub,
      marketValue: normalize(cells[5]?.text() ?? ""),
      url: `${config.webBase}${href}`,
    });
  });

  // Resumen de plantilla (tamaño, edad media, valor total).
  const summary = parseHeaderSummary($);
  const squadSizeItem = summary.items.find((item) => /jugadores en plantilla|tamaño/i.test(item.label));
  const averageAgeItem = summary.items.find((item) => /edad media/i.test(item.label));

  return {
    season,
    squadSize: squadSizeItem ? Number.parseInt(squadSizeItem.value, 10) || null : null,
    averageAge: averageAgeItem?.value ?? null,
    totalMarketValue: summary.totalMarketValue,
    players,
  };
}

// ---------------------------------------------------------------------------
// Clasificación de una competición
// ---------------------------------------------------------------------------

export interface LeagueTableRow {
  position: number | null;
  clubId: string | null;
  club: string;
  played: number | null;
  won: number | null;
  drawn: number | null;
  lost: number | null;
  goals: string;
  goalDifference: number | null;
  points: number | null;
  url: string | null;
}

export interface LeagueTableResult {
  season: number | null;
  rows: LeagueTableRow[];
}

function toInt(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed || !/^-?\d+$/.test(trimmed)) return null;
  return Number.parseInt(trimmed, 10);
}

export async function parseLeagueTable(html: string, fallbackSeason: number | null): Promise<LeagueTableResult> {
  const $ = cheerio.load(html);
  const title = normalize($("title").text());
  // La clasificación no lleva la temporada en el título: la tomamos de los
  // enlaces de la propia tabla (no de la navegación, que va a la actual).
  const season =
    seasonFromLinks($("table.items").first(), 'a[href*="saison_id"]') ??
    seasonFromTitle(title) ??
    fallbackSeason;

  const rows: LeagueTableRow[] = [];
  const table = $("table.items").first();
  const body = table.find("tbody").first();

  body.find("tr").each((_, row) => {
    const $row = $(row);
    const cells = $row.children("td, th").toArray().map((cell) => $(cell));
    if (cells.length < 10) return;

    const clubLink = $row.find('a[href*="/spielplan/verein/"]').first();
    if (clubLink.length === 0) return;
    const href = clubLink.attr("href") ?? "";

    const goals = normalize(cells[7]?.text() ?? "");
    const difference = goals.includes(":")
      ? Number.parseInt(goals.split(":")[0]!, 10) - Number.parseInt(goals.split(":")[1]!, 10)
      : null;

    rows.push({
      position: toInt(normalize(cells[0]?.text() ?? "")),
      clubId: idFromHref(href, "verein"),
      club: normalize(clubLink.attr("title") ?? clubLink.text()),
      played: toInt(normalize(cells[3]?.text() ?? "")),
      won: toInt(normalize(cells[4]?.text() ?? "")),
      drawn: toInt(normalize(cells[5]?.text() ?? "")),
      lost: toInt(normalize(cells[6]?.text() ?? "")),
      goals,
      goalDifference: difference,
      points: toInt(normalize(cells[9]?.text() ?? "")),
      url: `${config.webBase}${href}`,
    });
  });

  return { season, rows };
}

// ---------------------------------------------------------------------------
// Ranking de valores de mercado de una competición
// ---------------------------------------------------------------------------

export interface MarketValueRow {
  rank: number | null;
  playerId: string;
  name: string;
  position: string;
  nationality: string;
  age: string;
  club: string;
  clubId: string | null;
  marketValue: string;
  url: string;
}

export interface MarketValueResult {
  season: number | null;
  totalMarketValue: string | null;
  players: MarketValueRow[];
}

export async function parseMarketValues(html: string, fallbackSeason: number | null): Promise<MarketValueResult> {
  const $ = cheerio.load(html);
  const title = normalize($("title").text());
  const season =
    seasonFromTitle(title) ?? seasonFromLinks($("body"), 'a[href*="saison_id"]') ?? fallbackSeason;

  const players: MarketValueRow[] = [];
  const table = $("table.items").first();
  const body = table.find("tbody").first();

  body.find("tr").each((_, row) => {
    const $row = $(row);
    const cells = $row.children("td, th").toArray().map((cell) => $(cell));
    if (cells.length < 5) return;

    const playerLink = $row.find('a[href*="/profil/spieler/"]').first();
    if (playerLink.length === 0) return;
    const href = playerLink.attr("href") ?? "";
    const playerId = idFromHref(href, "spieler");
    if (!playerId) return;

    const infoCell = cells[1]!;
    const position = normalize(infoCell.find("table.inline-table tr").eq(1).text());

    players.push({
      rank: toInt(normalize(cells[0]?.text() ?? "")),
      playerId,
      name: normalize(playerLink.attr("title") ?? playerLink.text()),
      position,
      nationality: flagNames(cells[2]!).join(" / "),
      age: normalize(cells[3]?.text() ?? ""),
      club: crestName(cells[4]!),
      clubId: idFromHref(cells[4]?.find('a[href*="/startseite/verein/"]').first().attr("href"), "verein"),
      marketValue: normalize(cells[5]?.text() ?? ""),
      url: `${config.webBase}${href}`,
    });
  });

  let totalMarketValue: string | null = null;
  const summary = parseHeaderSummary($);
  totalMarketValue = summary.totalMarketValue;

  return { season, totalMarketValue, players };
}

// ---------------------------------------------------------------------------
// Fichajes de un club
// ---------------------------------------------------------------------------

export interface ClubTransferRow {
  playerId: string;
  name: string;
  position: string;
  age: string;
  nationality: string;
  club: string;
  clubId: string | null;
  fee: string;
  url: string;
}

export interface ClubTransfersResult {
  season: number | null;
  arrivals: ClubTransferRow[];
  departures: ClubTransferRow[];
  arrivalsFeeSum: string | null;
  departuresFeeSum: string | null;
}

function parseTransferTable(
  $: Cheerio,
  $table: cheerio.Cheerio<any>,
): { rows: ClubTransferRow[]; feeSum: string | null } {
  const rows: ClubTransferRow[] = [];
  let feeSum: string | null = null;

  const body = $table.find("tbody").first();
  body.find("tr").each((_, row) => {
    const $row = $(row);
    const cells = $row.children("td, th").toArray().map((cell) => $(cell));
    if (cells.length < 5) return;

    const playerLink = $row.find('a[href*="/profil/spieler/"]').first();
    if (playerLink.length === 0) return;
    const href = playerLink.attr("href") ?? "";
    const playerId = idFromHref(href, "spieler");
    if (!playerId) return;

    const infoCell = cells[1]!;
    const position = normalize(infoCell.find("table.inline-table tr").eq(1).text());
    const clubCell = cells[4]!;
    const clubLink = clubCell.find('a[href*="/startseite/verein/"]').first();

    rows.push({
      playerId,
      name: normalize(playerLink.attr("title") ?? playerLink.text()),
      position,
      age: normalize(cells[2]?.text() ?? ""),
      nationality: flagNames(cells[3]!).join(" / "),
      club: crestName(clubCell) || normalize(clubLink.attr("title") ?? ""),
      clubId: idFromHref(clubLink.attr("href"), "verein"),
      fee: normalize(cells[5]?.text() ?? ""),
      url: `${config.webBase}${href}`,
    });
  });

  const footer = $table.find("tfoot").text();
  const sumMatch = normalize(footer).match(/Suma:\s*([\d.,]+\s*[MK]?€)/i);
  if (sumMatch) feeSum = normalize(sumMatch[1]!);

  return { rows, feeSum };
}

export async function parseClubTransfers(html: string, fallbackSeason: number | null): Promise<ClubTransfersResult> {
  const $ = cheerio.load(html);
  const title = normalize($("title").text());
  const season =
    seasonFromTitle(title) ?? seasonFromLinks($("body"), 'a[href*="saison_id"]') ?? fallbackSeason;

  const tables = $("table.items").toArray();
  const arrivals = tables[0] ? parseTransferTable($, $(tables[0])) : { rows: [], feeSum: null };
  const departures = tables[1] ? parseTransferTable($, $(tables[1])) : { rows: [], feeSum: null };

  return {
    season,
    arrivals: arrivals.rows,
    departures: departures.rows,
    arrivalsFeeSum: arrivals.feeSum,
    departuresFeeSum: departures.feeSum,
  };
}

// ---------------------------------------------------------------------------
// Catálogo de competiciones
// ---------------------------------------------------------------------------

export interface CompetitionCatalogEntry {
  competitionId: string;
  name: string;
  country: string;
  url: string;
}

export async function parseCompetitionCatalog(html: string): Promise<CompetitionCatalogEntry[]> {
  const $ = cheerio.load(html);
  const entries = new Map<string, CompetitionCatalogEntry>();

  $('a[href*="/wettbewerb/"]').each((_, node) => {
    const $node = $(node);
    const href = $node.attr("href") ?? "";
    const match = href.match(/^\/([a-z0-9-]+)\/startseite\/wettbewerb\/([A-Z0-9]+)$/);
    if (!match) return;
    const competitionId = match[2]!;
    if (entries.has(competitionId)) return;

    // El enlace contiene solo el logo: el nombre va en el title del <a>.
    const name =
      normalize($node.attr("title") ?? "") ||
      normalize($node.find("img").attr("alt") ?? "") ||
      match[1]!;

    entries.set(competitionId, {
      competitionId,
      name,
      country: "",
      url: `${config.webBase}${href}`,
    });
  });

  return [...entries.values()];
}
