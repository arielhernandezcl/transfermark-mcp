/**
 * Prueba de humo: conecta un cliente MCP real al servidor por stdio,
 * lista las herramientas y las invoca con datos de ejemplo.
 *
 *   bun run test/smoke.ts
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({
  command: process.execPath,
  args: ["run", "src/index.ts"],
  cwd: new URL("..", import.meta.url).pathname,
  stderr: "pipe",
});

const client = new Client({ name: "smoke-test", version: "1.0.0" });

await client.connect(transport);

const tools = await client.listTools();
console.log(`\n=== ${tools.tools.length} herramientas registradas ===`);
for (const tool of tools.tools) {
  console.log(` - ${tool.name}: ${(tool.description ?? "").slice(0, 78)}`);
}

interface Case {
  tool: string;
  args: Record<string, unknown>;
  /** El caso debe devolver un error controlado, no un fallo. */
  expectError?: boolean;
}

const cases: Case[] = [
  { tool: "search_players", args: { query: "Mbappé" } },
  { tool: "search_clubs", args: { query: "Real Madrid" } },
  { tool: "search_competitions", args: { query: "Premier" } },
  { tool: "get_player_profile", args: { playerId: 8198 } },
  { tool: "get_player_transfers", args: { playerId: 8198 } },
  { tool: "get_player_market_value", args: { playerId: 8198 } },
  { tool: "get_player_performance", args: { playerId: 8198, season: 2026 } },
  { tool: "get_player_performance", args: { playerId: 8198, detail: "matches", limit: 3 } },
  { tool: "get_player_national_team", args: { playerId: 8198 } },
  { tool: "get_club_profile", args: { clubId: 418 } },
  { tool: "get_club_squad", args: { clubId: 418, limit: 5 } },
  { tool: "get_club_transfers", args: { clubId: 418 } },
  { tool: "get_competition_table", args: { competitionId: "ES1" } },
  { tool: "get_competition_market_values", args: { competitionId: "ES1", limit: 5 } },
  { tool: "get_competition_profile", args: { competitionId: "ES1" } },
  { tool: "get_reference_data", args: { type: "positions" } },
  // Casos límite: temporada histórica, ids inexistentes y búsquedas sin resultados.
  { tool: "get_club_squad", args: { clubId: 418, season: 2023, limit: 3 } },
  { tool: "get_club_transfers", args: { clubId: 418, season: 2023 } },
  { tool: "get_competition_table", args: { competitionId: "ES1", season: 2023 } },
  { tool: "get_player_profile", args: { playerId: 999999999 }, expectError: true },
  { tool: "get_competition_profile", args: { competitionId: "ZZZ9" }, expectError: true },
  { tool: "search_players", args: { query: "xyzqwerty-noexiste" }, expectError: true },
  { tool: "search_clubs", args: { query: "xyzqwerty-noexiste" }, expectError: true },
];

let failures = 0;

for (const testCase of cases) {
  const started = Date.now();
  try {
    const result = await client.callTool({ name: testCase.tool, arguments: testCase.args });
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? "";
    const isError = Boolean(result.isError);
    const ok = testCase.expectError ? isError : !isError;
    if (!ok) failures++;

    const status = ok ? (isError ? "error esperado" : "ok") : "FALLO";
    console.log(`\n--- ${testCase.tool} ${JSON.stringify(testCase.args)} [${Date.now() - started}ms] ${status}`);
    console.log(isError ? `  ${text.slice(0, 400)}` : text.slice(0, 700));
  } catch (error) {
    failures++;
    console.log(`\n--- ${testCase.tool} ${JSON.stringify(testCase.args)} EXCEPCIÓN: ${(error as Error).message}`);
  }
}

console.log(`\n=== fin: ${cases.length - failures}/${cases.length} correctos ===`);
await client.close();
process.exit(failures > 0 ? 1 : 0);
