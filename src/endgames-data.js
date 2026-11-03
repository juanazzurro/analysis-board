// Finales básicos. Cada posición está verificada con Stockfish (ganada si el objetivo es ganar, tablas si es defender).
import { tr } from "./i18n.js";

export const LESSONS = [
  {
    id: "dama", title: tr("Dama y rey contra rey", "Queen and king vs king"), level: tr("Básico", "Basic"), goal: "mate", side: "w", limit: 20,
    summary: tr("Dar mate con dama y rey contra el rey solo.", "Checkmate a lone king with king and queen."),
    ideas: [
      tr("Usá la dama para encerrar al rey rival en un rectángulo cada vez más chico: ubicala a un salto de caballo de él.", "Use the queen to trap the enemy king in an ever-smaller box: place it a knight's jump away from the king."),
      tr("Cuando el rey rival quede contra el borde, dejá la dama quieta y acercá tu rey.", "Once the enemy king is on the edge, keep the queen still and bring your king closer."),
      tr("Cuidado con el ahogado: si el rey rival no tiene jugadas y no está en jaque, son tablas.", "Watch out for stalemate: if the enemy king has no moves and isn't in check, it's a draw."),
      tr("El mate final: la dama da jaque en el borde, protegida por tu rey o con tu rey enfrente.", "The final mate: the queen checks on the edge, protected by your king or with your king facing theirs.")
    ],
    positions: ["8/8/8/4k3/8/8/8/3QK3 w - - 0 1", "8/8/3k4/8/8/8/8/Q3K3 w - - 0 1", "7k/8/8/8/8/8/8/1Q2K3 w - - 0 1", "8/8/8/8/2k5/8/8/4K2Q w - - 0 1"]
  },
  {
    id: "torres", title: tr("Dos torres: la escalera", "Two rooks: the ladder"), level: tr("Básico", "Basic"), goal: "mate", side: "w", limit: 12,
    summary: tr("Mate con dos torres sin ayuda del rey.", "Mate with two rooks without help from the king."),
    ideas: [
      tr("Una torre corta una fila; la otra da jaque en la fila siguiente. El rey rival retrocede de a una fila.", "One rook cuts off a rank; the other checks on the next rank. The enemy king is pushed back one rank at a time."),
      tr("Las torres se turnan, como subiendo una escalera, hasta llegar al borde.", "The rooks take turns, like climbing a ladder, until they reach the edge."),
      tr("Si el rey rival se acerca a una torre, llevala al otro extremo de la misma fila (lejos del rey).", "If the enemy king gets close to a rook, move it to the far end of the same rank (away from the king).")
    ],
    positions: ["8/8/8/3k4/8/8/8/R3K2R w - - 0 1", "8/8/8/8/5k2/8/8/RR2K3 w - - 0 1"]
  },
  {
    id: "torre", title: tr("Torre y rey contra rey", "Rook and king vs king"), level: tr("Básico", "Basic"), goal: "mate", side: "w", limit: 30,
    summary: tr("El mate más importante de aprender: aparece en muchísimas partidas.", "The most important mate to learn: it shows up in lots of games."),
    ideas: [
      tr("La torre corta al rey rival en una fila o columna: esa es su “caja”.", "The rook cuts the enemy king off along a rank or file: that's its “box”."),
      tr("Acercá tu rey hasta enfrentar al rey rival con una casilla de por medio (oposición). Ahí el jaque de la torre lo empuja hacia el borde.", "Bring your king until it faces the enemy king with one square between them (opposition). Then a rook check pushes it toward the edge."),
      tr("Si los reyes no están enfrentados, hacé una jugada de espera con la torre a lo largo de la fila, sin acercarla al rey rival.", "If the kings aren't facing each other, make a waiting move with the rook along the rank, without bringing it near the enemy king."),
      tr("En el borde, el mismo truco: reyes enfrentados y jaque de torre = mate.", "On the edge, same trick: kings facing each other plus a rook check = mate.")
    ],
    positions: ["8/8/8/4k3/8/8/8/R3K3 w - - 0 1", "8/8/3k4/8/8/8/8/4K2R w - - 0 1", "8/8/8/8/8/2k5/8/4K2R w - - 0 1"]
  },
  {
    id: "peon_ganar", title: tr("Rey y peón: ganar", "King and pawn: winning"), level: tr("Esencial", "Essential"), goal: "promote", side: "w", limit: 25,
    summary: tr("Coronar el peón con la ayuda del rey, usando la oposición.", "Promote the pawn with the help of the king, using the opposition."),
    ideas: [
      tr("El rey va adelante del peón, no atrás: primero el rey gana terreno y después avanza el peón.", "The king goes in front of the pawn, not behind: first the king gains ground, then the pawn advances."),
      tr("La oposición: con los reyes enfrentados y una casilla de por medio, el que tiene que mover cede terreno. Buscá que le toque mover al rival.", "The opposition: with the kings facing each other and one square between them, whoever has to move gives ground. Make sure it's your opponent's turn."),
      tr("Si tu rey llega a la sexta fila delante de su peón (si no es peón de torre), la partida está ganada.", "If your king reaches the sixth rank in front of its pawn (unless it's a rook pawn), the game is won."),
      tr("Si en algún momento te sobra un tiempo, una jugada de peón puede devolverte la oposición.", "If you ever have a spare tempo, a pawn move can give you back the opposition.")
    ],
    positions: ["4k3/8/4K3/4P3/8/8/8/8 w - - 0 1", "8/4k3/8/4K3/8/4P3/8/8 w - - 0 1", "3k4/8/3K4/3P4/8/8/8/8 w - - 0 1", "8/8/4k3/8/4K3/8/4P3/8 b - - 0 1", "8/8/8/4k3/8/4K3/4P3/8 b - - 0 1"]
  },
  {
    id: "peon_defender", title: tr("Rey y peón: defender", "King and pawn: defending"), level: tr("Esencial", "Essential"), goal: "draw", side: "b", limit: 25,
    summary: tr("Con el rey solo, frenar el peón rival y hacer tablas.", "With a lone king, stop the enemy pawn and draw."),
    ideas: [
      tr("Pará tu rey justo delante del peón rival: es la mejor casilla para bloquearlo.", "Put your king right in front of the enemy pawn: it's the best square to block it."),
      tr("Cuando el rey rival se acerque, tomá la oposición: enfrentalo con una casilla de por medio.", "When the enemy king approaches, take the opposition: face it with one square in between."),
      tr("Si te empujan hasta la última fila, quedate en la casilla de coronación o al lado: muchas veces el ahogado te salva.", "If you're pushed back to the last rank, stay on the promotion square or next to it: stalemate often saves you."),
      tr("Nunca te alejes del peón: a veces lo podés capturar si el rival se descuida.", "Never walk away from the pawn: sometimes you can win it if your opponent is careless.")
    ],
    positions: ["8/8/8/4k3/8/8/4P3/4K3 b - - 0 1", "4k3/8/8/4PK2/8/8/8/8 b - - 0 1", "8/8/4k3/8/4PK2/8/8/8 b - - 0 1", "8/3k4/8/3PK3/8/8/8/8 b - - 0 1"]
  },
  {
    id: "cuadrado", title: tr("La regla del cuadrado", "The rule of the square"), level: tr("Esencial", "Essential"), goal: "draw", side: "b", limit: 12,
    summary: tr("Saber al instante si tu rey alcanza un peón pasado.", "Know instantly whether your king can catch a passed pawn."),
    ideas: [
      tr("Imaginá un cuadrado que va desde el peón hasta su casilla de coronación.", "Picture a square that runs from the pawn to its promotion square."),
      tr("Si tu rey puede entrar en ese cuadrado en su jugada, alcanza al peón.", "If your king can step into that square on its move, it catches the pawn."),
      tr("Mové el rey en diagonal: avanza hacia el peón y hacia la fila de coronación a la vez.", "Move the king diagonally: it heads toward the pawn and the promotion rank at the same time.")
    ],
    positions: ["8/8/8/4k3/P7/8/8/7K b - - 0 1", "8/8/8/8/1P3k2/8/8/7K b - - 0 1", "8/8/8/5k2/1P6/8/8/K7 b - - 0 1"]
  },
  {
    id: "lucena", title: tr("Lucena: construir el puente", "Lucena: building a bridge"), level: tr("Avanzado", "Advanced"), goal: "promote", side: "w", limit: 25,
    summary: tr("La técnica ganadora de los finales de torre y peón.", "The winning technique in rook and pawn endgames."),
    ideas: [
      tr("Con tu peón en séptima y tu rey delante, primero cortá al rey rival con tu torre a una columna de distancia.", "With your pawn on the seventh and your king in front of it, first cut off the enemy king with your rook one file away."),
      tr("Llevá tu torre a la cuarta fila: va a ser el “puente” que tapa los jaques de costado.", "Bring your rook to the fourth rank: it will be the “bridge” that blocks the side checks."),
      tr("Sacá tu rey de delante del peón y, cuando empiecen los jaques, interponé la torre.", "Step your king out from in front of the pawn and, when the checks start, interpose the rook.")
    ],
    positions: ["1K1k4/1P6/8/8/8/8/r7/2R5 w - - 0 1", "3K4/3P2k1/8/8/8/8/2r5/4R3 w - - 0 1"]
  },
  {
    id: "philidor", title: tr("Philidor: defender con la torre", "Philidor: defending with the rook"), level: tr("Avanzado", "Advanced"), goal: "draw", side: "b", limit: 30,
    summary: tr("La defensa clásica de los finales de torre contra torre y peón.", "The classic defense in rook vs rook and pawn endgames."),
    ideas: [
      tr("Con tu rey delante del peón, poné tu torre en tu tercera fila (la sexta del rival) y dejala ahí.", "With your king in front of the pawn, put your rook on your third rank (the opponent's sixth) and keep it there."),
      tr("Así el rey rival no puede avanzar sin dejar de proteger al peón.", "That way the enemy king can't advance without leaving the pawn unprotected."),
      tr("Cuando el peón avance a esa fila, pasá la torre bien atrás y empezá a dar jaques desde lejos.", "When the pawn advances to that rank, move your rook far back and start checking from a distance.")
    ],
    positions: ["4k3/7R/8/3KP3/8/8/8/r7 b - - 0 1", "3k4/R7/8/2KP4/8/8/8/1r6 b - - 0 1"]
  }
];
