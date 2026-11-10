# Genera src/pieces.css a partir de los juegos de piezas de src/assets/pieces/.
names = {"P": "pawn", "N": "knight", "B": "bishop", "R": "rook", "Q": "queen", "K": "king"}
out = ["/* Juegos de piezas alternativos (el predeterminado, cburnett, viene con chessground). Generado por tools/pieces-css.py: no editar a mano. */"]
for s in ["merida", "mpchess", "chessnut"]:
    for c, cn in (("w", "white"), ("b", "black")):
        for p, pn in names.items():
            out.append(f':root[data-pieces="{s}"] .cg-wrap piece.{pn}.{cn}, :root[data-pieces="{s}"] piece.{pn}.{cn} {{ background-image: url("./assets/pieces/{s}/{c}{p}.svg"); }}')
out.append("/* Muestras de Ajustes: cada una con su propio juego, sin importar cuál esté elegido. */")
for s in ["cburnett", "merida", "mpchess", "chessnut"]:
    out.append(f':root .swatch .pc[data-set="{s}"] piece.knight.white {{ background-image: url("./assets/pieces/{s}/wN.svg"); }}')
open("src/pieces.css", "w").write("\n".join(out) + "\n")
