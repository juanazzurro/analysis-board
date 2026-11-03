import { EN, tr } from "./i18n.js";
// Nombres de aperturas en castellano. Lichess y Chess.com las nombran distinto (y en inglés);
// acá se unifican por familia. Si la partida no trae nombre, se reconoce por las primeras jugadas.

const FAMILY_ES = {
  "italian game": "Italiana", "giuoco piano": "Italiana", "two knights defense": "Dos caballos",
  "ruy lopez": "Española", "spanish game": "Española",
  "scotch game": "Escocesa", "scotch gambit": "Escocesa",
  "four knights game": "Cuatro caballos", "three knights opening": "Tres caballos",
  "petrovs defense": "Petrov", "petrov defense": "Petrov", "russian game": "Petrov",
  "philidor defense": "Philidor", "vienna game": "Vienesa", "kings gambit": "Gambito de rey",
  "bishops opening": "Apertura de alfil", "center game": "Apertura del centro", "danish gambit": "Gambito danés",
  "ponziani opening": "Ponziani", "latvian gambit": "Gambito letón", "elephant gambit": "Gambito elefante",
  "damiano defense": "Damiano", "kings knight opening": "Peón de rey", "kings pawn game": "Peón de rey", "kings pawn opening": "Peón de rey",
  "sicilian defense": "Siciliana", "french defense": "Francesa", "caro kann defense": "Caro-Kann",
  "scandinavian defense": "Escandinava", "pirc defense": "Pirc", "modern defense": "Moderna", "robatsch defense": "Moderna",
  "alekhine defense": "Alekhine", "alekhines defense": "Alekhine", "nimzowitsch defense": "Nimzowitsch", "owen defense": "Owen",
  "st george defense": "San Jorge", "rat defense": "Defensa Rata", "borg defense": "Borg", "barnes defense": "Barnes",
  "queens gambit": "Gambito de dama", "queens gambit accepted": "Gambito de dama aceptado", "queens gambit declined": "Gambito de dama rehusado",
  "slav defense": "Eslava", "semi slav defense": "Semieslava", "london system": "Sistema Londres", "colle system": "Sistema Colle",
  "queens pawn game": "Peón de dama", "queens pawn opening": "Peón de dama", "trompowsky attack": "Trompowsky",
  "kings indian defense": "India de rey", "kings indian attack": "Ataque indio de rey", "queens indian defense": "India de dama",
  "nimzo indian defense": "Nimzo-india", "indian defense": "Defensa india", "east indian defense": "Defensa india",
  "grunfeld defense": "Grünfeld", "dutch defense": "Holandesa", "benoni defense": "Benoni", "modern benoni": "Benoni",
  "englund gambit": "Gambito Englund", "blackmar diemer gambit": "Gambito Blackmar-Diemer", "budapest defense": "Budapest",
  "old indian defense": "India antigua", "catalan opening": "Catalana", "torre attack": "Ataque Torre", "richter veresov attack": "Veresov",
  "english opening": "Inglesa", "reti opening": "Réti", "zukertort opening": "Réti", "bird opening": "Bird",
  "nimzo larsen attack": "Larsen", "polish opening": "Polaca", "hungarian opening": "Húngara", "vant kruijs opening": "Van't Kruijs",
  "mieses opening": "Mieses", "saragossa opening": "Zaragoza", "grob opening": "Grob", "amar opening": "Amar", "anderssen opening": "Anderssen",
  "clemenz opening": "Clemenz", "ware opening": "Ware", "kadas opening": "Kádas", "sodium attack": "Ataque sodio",
  "scotch": "Escocesa", "caro kann": "Caro-Kann"
};

// Prefijos de jugadas (SAN), del más largo al más corto: gana el más específico.
const BY_MOVES = [
  ["e4 e5 Nf3 Nc6 Bc4 Nf6", "Dos caballos"], ["e4 e5 Nf3 Nc6 Bc4", "Italiana"], ["e4 e5 Nf3 Nc6 Bb5", "Española"],
  ["e4 e5 Nf3 Nc6 d4", "Escocesa"], ["e4 e5 Nf3 Nc6 Nc3 Nf6", "Cuatro caballos"], ["e4 e5 Nf3 Nc6 Nc3", "Tres caballos"],
  ["e4 e5 Nf3 Nc6 c3", "Ponziani"], ["e4 e5 Nf3 d6", "Philidor"], ["e4 e5 Nf3 Nf6", "Petrov"], ["e4 e5 Nf3 f6", "Damiano"],
  ["e4 e5 Nf3 f5", "Gambito letón"], ["e4 e5 Nf3 d5", "Gambito elefante"], ["e4 e5 Nc3", "Vienesa"], ["e4 e5 f4", "Gambito de rey"],
  ["e4 e5 Bc4", "Apertura de alfil"], ["e4 e5 d4 exd4 c3", "Gambito danés"], ["e4 e5 d4", "Apertura del centro"], ["e4 e5", "Peón de rey"],
  ["e4 c5", "Siciliana"], ["e4 e6", "Francesa"], ["e4 c6", "Caro-Kann"], ["e4 d5", "Escandinava"], ["e4 d6", "Pirc"],
  ["e4 g6", "Moderna"], ["e4 Nf6", "Alekhine"], ["e4 Nc6", "Nimzowitsch"], ["e4 b6", "Owen"], ["e4 a6", "San Jorge"], ["e4", "Peón de rey"],
  ["d4 d5 c4 c6", "Eslava"], ["d4 d5 c4 dxc4", "Gambito de dama aceptado"], ["d4 d5 c4 e6", "Gambito de dama rehusado"], ["d4 d5 c4", "Gambito de dama"],
  ["d4 d5 Bf4", "Sistema Londres"], ["d4 Nf6 Bf4", "Sistema Londres"], ["d4 d5 Nf3 Nf6 Bf4", "Sistema Londres"], ["d4 d5 Nf3 Bf5 Bf4", "Sistema Londres"],
  ["d4 d5 e4", "Gambito Blackmar-Diemer"], ["d4 d5 e3", "Sistema Colle"], ["d4 d5", "Peón de dama"],
  ["d4 Nf6 c4 g6 Nc3 d5", "Grünfeld"], ["d4 Nf6 c4 g6", "India de rey"], ["d4 Nf6 c4 e6 Nc3 Bb4", "Nimzo-india"],
  ["d4 Nf6 c4 e6 Nf3 b6", "India de dama"], ["d4 Nf6 c4 c5", "Benoni"], ["d4 Nf6 c4 e5", "Budapest"], ["d4 Nf6 Bg5", "Trompowsky"],
  ["d4 Nf6", "Defensa india"], ["d4 f5", "Holandesa"], ["d4 e5", "Gambito Englund"], ["d4 g6", "Moderna"], ["d4 d6", "Peón de dama"], ["d4", "Peón de dama"],
  ["c4", "Inglesa"], ["Nf3", "Réti"], ["f4", "Bird"], ["b3", "Larsen"], ["g3", "Húngara"], ["b4", "Polaca"], ["e3", "Van't Kruijs"], ["g4", "Grob"],
  ["Nc3", "Van Geet"]
].map(([m, n]) => [m.split(" "), n]).sort((a, b) => b[0].length - a[0].length);


// Las mismas familias, con su nombre habitual en inglés.
const ES_TO_EN = {
  "Alekhine": "Alekhine Defense", "Amar": "Amar Opening", "Anderssen": "Anderssen Opening", "Apertura de alfil": "Bishop's Opening",
  "Apertura del centro": "Center Game", "Ataque Torre": "Torre Attack", "Ataque indio de rey": "King's Indian Attack", "Ataque sodio": "Sodium Attack",
  "Barnes": "Barnes Defense", "Benoni": "Benoni Defense", "Bird": "Bird Opening", "Borg": "Borg Defense", "Budapest": "Budapest Gambit",
  "Caro-Kann": "Caro-Kann Defense", "Catalana": "Catalan Opening", "Clemenz": "Clemenz Opening", "Cuatro caballos": "Four Knights Game",
  "Damiano": "Damiano Defense", "Defensa Rata": "Rat Defense", "Defensa india": "Indian Defense", "Dos caballos": "Two Knights Defense",
  "Escandinava": "Scandinavian Defense", "Escocesa": "Scotch Game", "Eslava": "Slav Defense", "Española": "Ruy Lopez", "Francesa": "French Defense",
  "Gambito Blackmar-Diemer": "Blackmar-Diemer Gambit", "Gambito Englund": "Englund Gambit", "Gambito danés": "Danish Gambit",
  "Gambito de dama": "Queen's Gambit", "Gambito de dama aceptado": "Queen's Gambit Accepted", "Gambito de dama rehusado": "Queen's Gambit Declined",
  "Gambito de rey": "King's Gambit", "Gambito elefante": "Elephant Gambit", "Gambito letón": "Latvian Gambit", "Grob": "Grob Opening",
  "Grünfeld": "Grünfeld Defense", "Holandesa": "Dutch Defense", "Húngara": "Hungarian Opening", "India antigua": "Old Indian Defense",
  "India de dama": "Queen's Indian Defense", "India de rey": "King's Indian Defense", "Inglesa": "English Opening", "Italiana": "Italian Game",
  "Kádas": "Kádas Opening", "Larsen": "Nimzo-Larsen Attack", "Mieses": "Mieses Opening", "Moderna": "Modern Defense", "Nimzo-india": "Nimzo-Indian Defense",
  "Nimzowitsch": "Nimzowitsch Defense", "Owen": "Owen Defense", "Petrov": "Petrov's Defense", "Peón de dama": "Queen's Pawn Game",
  "Peón de rey": "King's Pawn Game", "Philidor": "Philidor Defense", "Pirc": "Pirc Defense", "Polaca": "Polish Opening", "Ponziani": "Ponziani Opening",
  "Réti": "Réti Opening", "San Jorge": "St. George Defense", "Semieslava": "Semi-Slav Defense", "Siciliana": "Sicilian Defense",
  "Sistema Colle": "Colle System", "Sistema Londres": "London System", "Tres caballos": "Three Knights Opening", "Trompowsky": "Trompowsky Attack",
  "Van Geet": "Van Geet Opening", "Van't Kruijs": "Van't Kruijs Opening", "Veresov": "Veresov Attack", "Vienesa": "Vienna Game", "Ware": "Ware Opening",
  "Zaragoza": "Saragossa Opening", "Otras": "Other"
};

const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
  .replace(/['’.]/g, "").replace(/-/g, " ").replace(/defence/g, "defense").replace(/\s+/g, " ").trim();

/** Familia en castellano a partir del nombre (Lichess / Chess.com). Devuelve "" si no la reconoce. */
const GENERIC = new Set(["Peón de rey", "Peón de dama", "Defensa india"]);
export function familyFromName(name) {
  if (!name) return "";
  const fam = baseFamily(name);
  if (!GENERIC.has(fam)) return fam;
  // "Queen's Pawn Game: London System" → mejor "Sistema Londres" que "Peón de dama".
  const full = norm(name);
  for (const k of Object.keys(FAMILY_ES)) if (k.split(" ").length >= 2 && !GENERIC.has(FAMILY_ES[k]) && full.includes(k)) return FAMILY_ES[k];
  return fam;
}
function baseFamily(name) {
  const base = norm(String(name).split(":")[0]);
  if (FAMILY_ES[base]) return FAMILY_ES[base];
  // Probar prefijos cada vez más cortos ("queens pawn opening accelerated london system" → "queens pawn opening").
  const words = base.split(" ");
  for (let n = words.length - 1; n >= 1; n--) { const k = words.slice(0, n).join(" "); if (FAMILY_ES[k]) return FAMILY_ES[k]; }
  // Algunas variantes con nombre propio esconden la familia más adelante ("... London System").
  for (const k of Object.keys(FAMILY_ES)) if (k.split(" ").length >= 2 && base.includes(k)) return FAMILY_ES[k];
  return "";
}

/** Familia por las primeras jugadas (lista de SAN). */
export function familyFromMoves(sans) {
  if (!sans || !sans.length) return "";
  for (const [seq, name] of BY_MOVES) {
    if (seq.length > sans.length) continue;
    let ok = true;
    for (let i = 0; i < seq.length; i++) if (sans[i].replace(/[+#]/g, "") !== seq[i]) { ok = false; break; }
    if (ok) return name;
  }
  return "";
}

/** Nombre de familia para el informe de aperturas (en el idioma de la app). */
export function openingFamilyEs(name, sans) {
  const es = familyFromName(name) || familyFromMoves(sans);
  if (es) return EN ? ES_TO_EN[es] || es : es;
  return (name ? String(name).split(":")[0].trim() : "") || tr("Otras", "Other");
}
/** Nombre corto para mostrar en la lista de partidas. */
export function familyLabel(name) {
  const es = familyFromName(name);
  return es ? (EN ? ES_TO_EN[es] || es : es) : "";
}
