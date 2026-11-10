// Hilo de trabajo de la biblioteca: lee el PGN de cada partida y, si hace falta, clasifica sus errores, sin frenar la interfaz.
// Recibe { id, pgn, analysis?, uc? } y responde { id, game, at?, diag? } (o { id, error }).
import { parseGame } from "./chess-util.js";
import { computeDiag } from "./motifs.js";
self.onmessage = (ev) => {
  const { id, pgn, analysis, uc } = ev.data;
  try {
    const game = parseGame(pgn);
    const out = { id, game };
    if (analysis && uc) { out.at = analysis.at; out.diag = computeDiag(game, analysis, uc); }
    self.postMessage(out);
  } catch (e) { self.postMessage({ id, error: String((e && e.message) || e) }); }
};
