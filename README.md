<div align="center">

# transfermark-mcp

**Servidor MCP local para consultar datos de Transfermarkt con [Bun](https://bun.com).**

[![Bun](https://img.shields.io/badge/runtime-Bun-000?logo=bun&logoColor=fff)](https://bun.com)
[![MCP](https://img.shields.io/badge/protocol-MCP-8A2BE2)](https://modelcontextprotocol.io)
[![TypeScript](https://img.shields.io/badge/language-TypeScript-3178C6?logo=typescript&logoColor=fff)](https://www.typescriptlang.org)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](#licencia)

Jugadores · Clubes · Fichajes · Valores de mercado · Clasificaciones · Estadísticas partido a partido

</div>

---

## Por qué este servidor

Transfermarkt es la referencia en datos de fútbol, pero no ofrece una API pública. Este servidor envuelve **dos** fuentes complementarias:

1. **La API JSON oficial** que usa la propia web (`tmapi.transfermarkt.technology`) — datos estructurados y estables: perfiles, historiales de fichajes, evolución del valor de mercado, estadísticas partido a partido y catálogos de referencia.
2. **El HTML renderizado en servidor** (`transfermarkt.es`) — búsqueda rápida, plantillas, clasificaciones y rankings de valores de mercado.

El resultado es un servidor MCP listo para usar desde opencode, Claude Desktop u otros clientes MCP, con **15 herramientas** que cubren el flujo completo: buscar → consultar → comparar.

## Tabla de contenidos

- [Instalación](#instalación)
- [Uso rápido](#uso-rápido)
- [Herramientas](#herramientas)
- [Ejemplos de uso](#ejemplos-de-uso)
- [Configuración](#configuración)
- [Integración con opencode](#integración-con-opencode)
- [Arquitectura](#arquitectura)
- [Desarrollo](#desarrollo)
- [Solución de problemas](#solución-de-problemas)
- [Licencia](#licencia)

## Instalación

**Requisitos:** [Bun](https://bun.com) ≥ 1.3.

```bash
git clone <url-del-repo> transfermark-mcp
cd transfermark-mcp
bun install
```

## Uso rápido

```bash
# Servidor MCP por stdio
bun run src/index.ts

# Prueba de humo (cliente MCP real, 23 casos)
bun run test/smoke.ts

# Comprobación de tipos
bun run typecheck
```

## Herramientas

### Búsqueda

| Herramienta | Descripción |
| --- | --- |
| `search_players` | Busca jugadores por nombre. Devuelve `playerId`, posición, club, edad, nacionalidad y valor. |
| `search_clubs` | Busca clubes por nombre. Devuelve `clubId`, liga, país, tamaño de plantilla y valor. |
| `search_competitions` | Busca ligas y torneos. Devuelve `competitionId`, país y temporada en curso. |

### Jugadores

| Herramienta | Descripción |
| --- | --- |
| `get_player_profile` | Perfil completo: datos personales, posición, contrato, club actual, dorsal y valor de mercado (actual, anterior y máximo). |
| `get_player_transfers` | Historial de fichajes: origen, destino, fecha, coste, valor en el momento y contrato. |
| `get_player_market_value` | Evolución del valor de mercado por temporada, con club y edad, más el pico histórico. |
| `get_player_performance` | Estadísticas por partido. `detail="summary"` agrega por temporada y competición; `detail="matches"` lista los partidos. |
| `get_player_national_team` | Partidos y goles con cada selección nacional. |

### Clubes

| Herramienta | Descripción |
| --- | --- |
| `get_club_profile` | Liga, ciudad, colores, tamaño de plantilla, edad media y valores de mercado. |
| `get_club_squad` | Plantilla con dorsal, posición, edad, nacionalidad y valor. Admite temporadas históricas. |
| `get_club_transfers` | Altas y bajas por temporada con coste de cada operación. |

### Competiciones

| Herramienta | Descripción |
| --- | --- |
| `get_competition_table` | Clasificación: posición, partidos, ganados, empatados, perdidos, goles y puntos. |
| `get_competition_market_values` | Ranking de los jugadores más valiosos de la competición. |
| `get_competition_profile` | Temporada actual, país, jornadas y valor de mercado total. |

### Referencia

| Herramienta | Descripción |
| --- | --- |
| `get_reference_data` | Catálogos de países, posiciones, lesiones, ausencias, fabricantes y contratos. |

## Ejemplos de uso

### "¿Quién es el jugador más valioso de LaLiga?"

```
search_competitions({ query: "LaLiga" })        → competitionId: "ES1"
get_competition_market_values({ competitionId: "ES1", limit: 3 })
```

```json
{
  "totalMarketValue": "6.127,10 M€",
  "players": [
    { "rank": 1, "name": "Lamine Yamal",  "position": "Extremo derecho",   "age": "19", "marketValue": "220,00 M€", "club": "FC Barcelona" },
    { "rank": 2, "name": "Kylian Mbappé", "position": "Delantero centro",  "age": "27", "marketValue": "200,00 M€", "club": "Real Madrid CF" },
    { "rank": 3, "name": "Jude Bellingham", "position": "Mediocentro ofensivo", "age": "23", "marketValue": "160,00 M€", "club": "Real Madrid CF" }
  ]
}
```

### "¿Cómo ha evolucionado el valor de mercado de Ronaldo?"

```
search_players({ query: "Cristiano Ronaldo" })   → playerId: 8198
get_player_market_value({ playerId: 8198 })
```

Devuelve 51 puntos de datos (2004 → 2026), con club, edad y valor en cada fecha, además del pico histórico (€120,00 M en 2018) y el valor actual (€10,00 M).

### "Estadísticas de goles de un jugador por temporada"

```
get_player_performance({ playerId: 8198, detail: "summary" })
```

```json
{
  "totalGamesInScope": 1663,
  "totalPlayed": 1363,
  "overall": { "matches": 1363, "minutes": 111309, "goals": 991, "assists": 315, "yellowCards": 168, "redCards": 0 },
  "bySeason": [
    { "season": "26/27", "matches": 13, "minutes": 1030, "goals": 9, "assists": 0 },
    { "season": "25/26", "matches": 34, "minutes": 2700, "goals": 25, "assists": 3 }
  ]
}
```

### "Clasificación de la Premier League en 2023"

```
get_competition_table({ competitionId: "GB1", season: 2023 })
```

Devuelve los 20 equipos con partidos, ganados, empatados, perdidos, goles y puntos.

## Configuración

Todo se controla por variables de entorno (con valores por defecto sensatos):

| Variable | Por defecto | Descripción |
| --- | --- | --- |
| `TRANSFERMARKT_DOMAIN` | `es` | Dominio a consultar: `es`, `us`, `de`, `co.uk`, `it`, `fr`, `pt`, `nl`, `com`… |
| `TRANSFERMARKT_LOCALE` | según dominio | Locale `Accept-Language` de la API. |
| `TRANSFERMARKT_CONTEXT` | según dominio | Contexto `X-Preferred-Context` de la API. |
| `TRANSFERMARKT_CACHE_TTL_MINUTES` | `30` | TTL por defecto de la caché en memoria. |
| `TRANSFERMARKT_RATE_LIMIT_MS` | `250` | Separación mínima entre peticiones al mismo host. |
| `TRANSFERMARKT_MAX_CONCURRENCY` | `6` | Peticiones simultáneas por host. |
| `TRANSFERMARKT_TIMEOUT_MS` | `20000` | Timeout de las peticiones HTTP. |
| `TRANSFERMARKT_USER_AGENT` | navegador Chrome | User-Agent enviado a Transfermarkt. |

Ejemplo en inglés:

```bash
TRANSFERMARKT_DOMAIN=us bun run src/index.ts
```

## Integración con opencode

Este repositorio ya incluye `opencode.json`, que registra el servidor como MCP local:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "servers": {
      "transfermark": {
        "type": "local",
        "command": ["bun", "run", "src/index.ts"],
        "cwd": ".",
        "environment": { "TRANSFERMARKT_DOMAIN": "es" }
      }
    }
  }
}
```

Comprueba el estado de la conexión con:

```bash
opencode mcp list
# ✓ transfermark  connected
```

Las herramientas quedan disponibles como `transfermark_<herramienta>`.

### Otros clientes MCP

```json
{
  "mcpServers": {
    "transfermark": {
      "command": "bun",
      "args": ["/ruta/absoluta/al/transfermark-mcp/src/index.ts"]
    }
  }
}
```

## Arquitectura

```
┌──────────────────────────────────────────────────────────────┐
│  Cliente MCP (opencode, Claude Desktop, …)                    │
└──────────────┬───────────────────────────────────────────────┘
               │ stdio (JSON-RPC)
┌──────────────┴───────────────────────────────────────────────┐
│  src/index.ts  →  src/tools.ts (15 herramientas)             │
│                                                              │
│  ┌──────────────┐   ┌──────────────┐   ┌─────────────────┐  │
│  │  src/api.ts  │   │ src/pages.ts │   │ src/resolver.ts │  │
│  │  API JSON    │   │ HTML pages   │   │ ids → nombres   │  │
│  └──────┬───────┘   └──────┬───────┘   └────────┬────────┘  │
│         └──────────────────┴────────────────────┘           │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  src/http.ts (fetch + reintentos + rate limit)       │  │
│  │  src/cache.ts (TTL en memoria)                       │  │
│  │  src/html.ts (parsers cheerio)                       │  │
│  └───────────────────────────────────────────────────────┘  │
└──────────────┬───────────────────────────────────────────────┘
               │ HTTPS
┌──────────────┴───────────────────────────────────────────────┐
│  tmapi.transfermarkt.technology  ·  transfermarkt.es          │
└──────────────────────────────────────────────────────────────┘
```

| Módulo | Responsabilidad |
| --- | --- |
| `src/index.ts` | Punto de entrada: servidor MCP sobre stdio. |
| `src/config.ts` | Configuración por variables de entorno. |
| `src/cache.ts` | Caché en memoria con TTL y deduplicación de promesas en vuelo. |
| `src/http.ts` | `fetch` con timeout, reintentos con backoff y limitación de tasa por host. |
| `src/api.ts` | Cliente de la API JSON de Transfermarkt. |
| `src/html.ts` | Parsers del HTML público (cheerio). |
| `src/pages.ts` | Descarga de las páginas solo disponibles en HTML. |
| `src/resolver.ts` | Resolución de ids a nombres con caché. |
| `src/tools.ts` | Registro y handlers de las 15 herramientas MCP. |
| `src/types.ts` | Tipos de las respuestas de la API. |

## Desarrollo

```bash
bun run typecheck          # tsc --noEmit
bun run test/smoke.ts      # prueba de humo extremo a extremo (23 casos)
bun run dev                # modo watch
```

El proyecto no tiene dependencias en tiempo de ejecución más allá de `@modelcontextprotocol/sdk`, `cheerio` y `zod`.

## Solución de problemas

- **`opencode mcp list` no muestra el servidor** → asegúrate de estar en el directorio del proyecto; opencode descubre `opencode.json` caminando los directorios padre.
- **Un parser devuelve datos vacíos** → Transfermarkt cambió de maquetación. Todos los selectores están centralizados en `src/html.ts`; revisa la página afectada y ajusta el parser. La parte de la API es mucho más estable.
- **La primera llamada a `get_player_performance` tarda ~15 s** → descarga ~3,6 MB de datos de partido y los cachea 3 h. Las siguientes son instantáneas.
- **Valores de mercado en `null` para temporadas históricas** → la cabecera de la página de plantilla muestra los datos de la temporada actual. La herramienta lo señala con un `note` explícito en lugar de devolver un dato engañoso.
- **Cambiar de idioma** → `TRANSFERMARKT_DOMAIN=de bun run src/index.ts` (o `us`, `co.uk`, etc.). Las posiciones y ligas se traducen automáticamente.

## Licencia

[MIT](LICENSE). Los datos son propiedad de Transfermarkt y se accede a ellos respetando su política de uso (limitación de tasa, caché agresiva, User-Agent realista). Este proyecto es un envoltorio no oficial y no está afiliado a Transfermarkt.