#!/usr/bin/env bun
/**
 * Servidor MCP de Transfermarkt.
 *
 * Transporte stdio: el cliente MCP (Claude Desktop, opencode, ...) lanza este
 * proceso como hijo y se comunica por stdin/stdout.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { config } from "./config.ts";
import { registerTools } from "./tools.ts";

const server = new McpServer(
  {
    name: "transfermark-mcp",
    version: "0.1.0",
  },
  {
    instructions: [
      "Herramientas para consultar datos de Transfermarkt: jugadores, clubes, fichajes, valores de mercado, clasificaciones y estadísticas de partidos.",
      "Empieza por search_players / search_clubs / search_competitions para obtener los ids numéricos que exigen el resto de herramientas.",
      `Los datos se obtienen del dominio transfermarkt.${config.domain} en ${config.locale}.`,
    ].join(" "),
  },
);

registerTools(server);

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // En stdio no se puede escribir en stdout: los logs van a stderr.
  console.error(
    `[transfermark-mcp] listo · dominio=${config.domain} · locale=${config.locale} · contexto=${config.context}`,
  );
}

main().catch((error) => {
  console.error("[transfermark-mcp] error fatal:", error);
  process.exit(1);
});
