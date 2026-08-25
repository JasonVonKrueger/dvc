# Da Vinci's Challenge Repository Analysis

## Scope

This document describes the repository as it exists in the current checkout. It is an analysis document, not a record of changes to the existing application code. The project is a browser-based Da Vinci's Challenge game with a Node.js server, an in-memory game model, and a vanilla JavaScript client.

## Executive Summary

The application is a small, understandable prototype with a useful separation between the server-side game model and the browser UI. Express serves the static client and exposes HTTP commands. A raw WebSocket server is used to broadcast state changes back to connected browsers. Pattern scoring has recently been organized around a reverse index, which is a good direction for keeping move evaluation bounded.

The main risks are in the server boundary rather than the visual client: game mutations trust caller-supplied identity and move data, broadcasts are global, games are never retired, and the communication contract is split between HTTP commands and WebSocket notifications. The project also has no automated tests and its `npm start` script is empty, which makes the current behavior difficult to verify or deploy consistently.

## Repository Shape

| Area | Role |
| --- | --- |
| `server.js` | Express application, WebSocket upgrade handling, game registry, and command dispatch |
| `conf/server.js` | Development/production port configuration |
| `lib/game.js` | Server-side game state, move bookkeeping, scoring, and bot selection |
| `lib/pattern_index.js` | Reverse lookup from board slots to candidate scoring patterns |
| `lib/score_patterns.json` | Scoring pattern definitions and point values |
| `lib/slot_centroids.json` | Board geometry/slot data used by the scoring implementation |
| `public/index.html` | Browser entry point and UI shell |
| `public/resources/js/main.js` | Browser event handling, rendering, and HTTP command submission |
| `public/resources/js/socket.js` | Raw WebSocket connection and broadcast handling |
| `public/resources/classes/` | Small client-side state classes; much of the authoritative model remains on the server |
| `docs/` | Repository documentation; empty before this report |

## Runtime Architecture

1. `server.js` creates an Express app and serves `public/` as static content.
2. A `ws` server is attached to the same HTTP server through the `/sockets` upgrade path.
3. `GET /create/:gameType` constructs a `Game` and stores it in the process-local `GAMES` array.
4. `GET /join/:gameID/:playerNumber` marks a player as joined. In solo mode, player 2 is marked as the bot and the game becomes ready.
5. The client sends game commands as JSON to `POST /do`.
6. The command handler mutates the matching `Game`, then sends JSON notifications over WebSocket.
7. The browser filters received notifications by `gameID` and updates its local UI.

This means HTTP is the command channel and WebSocket is primarily the notification channel. `socket.io` is declared as a dependency, but the implementation uses the separate `ws` package instead.

## HTTP API and Commands

### HTTP routes

| Route | Behavior | Notes |
| --- | --- | --- |
| `GET /create/:gameType` | Creates a game and returns its ID | Game is held only in memory |
| `GET /join/:gameID/:playerNumber` | Joins player 1 or 2 | Caller chooses the player number |
| `GET /listgames` | Returns the complete `GAMES` array | Exposes internal game objects and all active games |
| `POST /do` | Dispatches a command based on `req.body.event` | Unknown events do not receive a clear error response |

### Supported `POST /do` events

- `START_GAME`: announces that a game has started.
- `MOVE_STARTED`: sets `currentPlayer` and marks a move as started.
- `MOVE_COMPLETE`: removes a slot, assigns it to the current player, scores newly completed patterns, and announces the move.
- `SWITCH_PLAYER`: changes the active player and announces the switch.
- `GO_BOT`: asks the server-side game model to select a bot piece and broadcasts the result.

The event names are duplicated as string literals across server and client code. A shared schema or constants module would reduce drift and make payload validation easier.

## Game and Scoring Model

`lib/game.js` owns the authoritative server state. A game contains two players, available board slots, the current player, status/move flags, and a set of already claimed pattern instances. The model initializes each player with 45 oval pieces and 27 triangular pieces, for 72 pieces per player.

Move completion follows this sequence:

1. Remove the requested slot from `availableSlots`.
2. Append the slot to the current player's slot list.
3. Use the newly placed slot with the reverse pattern index to identify only patterns that could have changed.
4. Check whether the player's claimed slots satisfy each candidate pattern.
5. Award each unclaimed match and add its pattern key to `claimedPatterns`.
6. Broadcast score notifications followed by the move-complete notification.

The reverse index is a sensible optimization over checking every pattern after every move. The use of a claimed-pattern set also addresses double scoring when patterns overlap or a later move revisits a previously satisfied configuration. The bot currently selects a random remaining piece type and an available slot; it is not a strategic opponent.

## Findings

### High priority: caller-controlled game mutations

The server accepts `gameID`, `playerNumber`, `currentPlayer`, and `slotID` directly from the request body or URL. There is no session, player token, or authorization check tying a connection to a player. Any caller who knows a game ID can join as either player, switch the active player, start moves, and submit moves on behalf of another player.

`MOVE_COMPLETE` also trusts the requested slot. The server should reject a slot that is not currently available, reject an invalid player or game phase, and ensure that the move is submitted by the player whose turn it is. These checks belong in the server-side game model or a command/service layer, not only in the browser.

### High priority: broadcasts are not scoped on the server

The broadcast helper sends notifications to every connected WebSocket client. The browser then ignores messages whose `gameID` does not match its local game. This is a privacy and data-isolation problem: clients can still receive other games' IDs, moves, and scores by inspecting the socket traffic. Maintain a subscription set per game, or associate a WebSocket connection with a game after join and broadcast only to that group.

### High priority: split and incomplete transport contract

The client opens a raw WebSocket and listens for broadcasts, while commands are sent through HTTP. The server's inbound WebSocket message handler parses messages but does not process them. Meanwhile, `socket.io` is installed but unused. This creates two protocol implementations and makes reconnect, ordering, error reporting, and authentication harder to reason about. The project should either:

- keep HTTP commands plus raw WebSocket notifications and remove the unused inbound socket code/dependency, or
- adopt one complete real-time protocol and implement command handling, errors, and connection lifecycle consistently.

### High priority: unbounded process-local game registry

`GAMES` is an in-memory array. A restart destroys all games, and there is no cleanup path after a game ends or a client abandons it. Long-running processes will retain every created game and incur increasingly expensive linear lookup. Add explicit game lifecycle states and expiration/removal, then add persistence only if games must survive restarts or multiple server instances.

### Medium priority: weak API/error handling

Malformed JSON, missing fields, unknown game IDs, unsupported game types, duplicate joins, and unknown command names do not have a consistent HTTP status and error payload. The `GO_BOT` branch can also fall through without sending a response when the game is missing. Add request schemas, bounded body/input values, and one error format. Use `400` for invalid commands and `404` for missing games rather than returning success-shaped responses for failures.

### Medium priority: duplicate and stale client game logic

Bot selection exists in the server game model and also in `lib/player.js`. The client-side version contains test-shaped hardcoded slot arrays and references state that is not clearly owned by the class. The client classes under `public/resources/classes/` are minimal compared with the server model. Keeping gameplay decisions server-side is the safer design; unused client implementations should be removed or clearly isolated as presentation state.

### Medium priority: no executable development workflow

`package.json` has an empty `start` script, and `npm test` intentionally exits with an error because no tests are configured. There is no lint, format, type-check, or CI configuration. The documented/manual fallback is `node server.js`, but a project should provide a working `npm start` and at least a small test suite for game rules and command validation.

### Low priority: dependency and maintenance clarity

The package manifest includes both `socket.io` and `ws`, although only `ws` is used by the server and browser client. Removing the unused dependency, or completing a deliberate migration, would make the transport choice explicit. Commented-out client code and placeholder files such as `nofile.txt` also add noise when navigating the project.

## Recommended Order of Work

1. Add server-side command validation: supported game types, player numbers, game phases, turn ownership, available slots, and response status codes.
2. Add connection/player identity and scope WebSocket broadcasts to the relevant game.
3. Add focused tests for slot removal, duplicate-slot rejection, scoring, overlapping patterns, turn switching, and bot moves.
4. Fix `npm start` and add a small documented smoke-test flow for create, join, start, move, and notification handling.
5. Define game expiration and remove completed/abandoned games from memory.
6. Decide whether persistence is a requirement; if so, place it behind a repository/service boundary rather than coupling it to route handlers.
7. Simplify the transport layer and remove unused dependencies and stale duplicate gameplay code.

## Suggested Verification Checklist

- Two browser sessions in different games cannot receive each other's notifications.
- A player cannot submit a move for the other player or outside the active turn.
- A slot can be claimed only once, including under concurrent requests.
- Every route returns a response for valid and invalid input.
- A server restart has an explicitly documented effect on active games.
- `npm start` launches the server and an automated test command passes.
