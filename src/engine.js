import { tr } from "./i18n.js";
// Envoltorio UCI sobre el Stockfish nativo que corre en el proceso principal.
export function parseInfo(line) {
  if (!line.startsWith("info ") || line.indexOf(" pv ") < 0) return null;
  const t = line.split(/\s+/);
  const o = { depth: 0, multipv: 1, pv: [] };
  for (let i = 1; i < t.length; i++) {
    const k = t[i];
    if (k === "depth") o.depth = +t[++i];
    else if (k === "seldepth") o.seldepth = +t[++i];
    else if (k === "multipv") o.multipv = +t[++i];
    else if (k === "nodes") o.nodes = +t[++i];
    else if (k === "nps") o.nps = +t[++i];
    else if (k === "score") {
      const kind = t[++i]; const v = +t[++i];
      if (kind === "cp") o.cp = v; else o.mate = v;
      if (t[i + 1] === "lowerbound" || t[i + 1] === "upperbound") { o.bound = t[++i]; }
    } else if (k === "pv") { o.pv = t.slice(i + 1); break; }
  }
  if (o.cp == null && o.mate == null) return null;
  return o;
}

export class Engine {
  constructor(id) {
    this.id = id;
    this.listeners = new Set();
    this.queue = Promise.resolve();
    this.current = null;
    this.ready = false;
    this.failed = null;
    window.api.onEngineLine((eid, line) => { if (eid === this.id) for (const f of [...this.listeners]) f(line); });
    window.api.onEngineExit((eid, code) => {
      if (eid !== this.id) return;
      this.ready = false;
      this.failed = tr("El motor se cerró inesperadamente (", "The engine closed unexpectedly (") + code + ").";
      try { window.api.log("motor cerrado", this.id, String(code)); } catch (e) {}
      for (const f of [...this.listeners]) f("__exit__");
    });
  }
  send(cmd) { window.api.engineSend(this.id, cmd); }
  waitFor(token, ms) {
    return new Promise((res, rej) => {
      const t = setTimeout(() => { this.listeners.delete(f); rej(new Error(tr("El motor no respondió a tiempo.", "The engine didn't respond in time."))); }, ms);
      const f = (l) => {
        if (l === "__exit__") { clearTimeout(t); this.listeners.delete(f); rej(new Error(tr("El motor se cerró.", "The engine closed."))); }
        else if (l.startsWith(token)) { clearTimeout(t); this.listeners.delete(f); res(l); }
      };
      this.listeners.add(f);
    });
  }
  async start({ threads = 2, hash = 128 } = {}) {
    this.failed = null; this.ready = false;
    this.queue = Promise.resolve();
    try { await window.api.engineStart(this.id); }
    catch (e) { const msg = String(e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, ""); this.failed = msg; throw new Error(msg); }
    const p = this.waitFor("uciok", 15000); this.send("uci"); await p;
    this.send(`setoption name Threads value ${threads}`);
    this.send(`setoption name Hash value ${hash}`);
    const r = this.waitFor("readyok", 15000); this.send("isready"); await r;
    this.ready = true;
    return this;
  }
  /** Encola opciones (se aplican entre búsquedas). */
  configure(opts) {
    this.queue = this.queue.then(async () => {
      for (const [k, v] of Object.entries(opts)) this.send(`setoption name ${k} value ${v}`);
      const r = this.waitFor("readyok", 10000); this.send("isready");
      try { await r; } catch (e) { /* seguir */ }
    });
    return this.queue;
  }
  newGame() {
    this.queue = this.queue.then(async () => {
      this.send("ucinewgame");
      const r = this.waitFor("readyok", 10000); this.send("isready");
      try { await r; } catch (e) {}
    });
    return this.queue;
  }
  /**
   * Búsqueda en cola. go = "depth 18 movetime 1500", etc.
   * Devuelve { promise, cancel }. La promesa resuelve { best, info, lines } o null si se canceló antes de empezar.
   */
  search(fen, go, onInfo, maxMs = 120000) {
    const job = { cancelled: false };
    job.promise = this.queue = this.queue.then(() => new Promise((res) => {
      if (job.cancelled || !this.ready) { res(null); return; }
      let guard = setTimeout(() => {
        this.send("stop");
        guard = setTimeout(() => { this.listeners.delete(f); this.current = null; res(null); }, 4000);
      }, maxMs);
      const done = (v) => { clearTimeout(guard); res(v); };
      const multi = {}; let last = null;
      const f = (line) => {
        if (line === "__exit__") { this.listeners.delete(f); this.current = null; done(null); return; }
        if (line.startsWith("info ")) {
          const info = parseInfo(line);
          if (info && !info.bound) {
            multi[info.multipv] = info;
            if (info.multipv === 1) last = info;
            if (onInfo) onInfo(info, multi);
          }
        } else if (line.startsWith("bestmove")) {
          this.listeners.delete(f); this.current = null;
          const bm = line.split(/\s+/)[1];
          done({ best: bm && bm !== "(none)" ? bm : null, info: last, lines: Object.values(multi).sort((a, b) => a.multipv - b.multipv), cancelled: job.cancelled });
        }
      };
      this.listeners.add(f);
      this.current = job;
      this.send("position fen " + fen);
      this.send("go " + go);
    }));
    job.cancel = () => {
      if (job.cancelled) return;
      job.cancelled = true;
      if (this.current === job) this.send("stop");
    };
    return job;
  }
  stopAll() { if (this.current) this.current.cancel(); }
}
