# Changelog

## 2.0.0 (2026-11-10)

A major update: a new look, a complete analysis board and written reports.

**Analysis**
- Live engine at every position with several lines. Click a move in a line to see it on the board; the space bar plays the engine's recommended move for whichever side is to move. Optionally the engine answers your moves by itself.
- A real variation tree: variations branch and nest, are saved with the game and exported in the PGN.
- Free board: analyze any position from a FEN, or enter a game by hand and save it.
- Choose the piece when promoting (it used to be always a queen), in every board of the app.
- Clocks and material next to each player; copy FEN and PGN; export to a PGN file.
- The move list is always visible, and the panel adapts to small windows.

**Reports**
- A written report for every game: how it unfolded, the moment that decided it, how you used the clock, your mistakes by type.
- The game in context with your other games of the week and month: accuracy against your average, whether the mistakes are your recurring ones, your record with that opening.
- Weekly and monthly report in Diagnosis, compared with the previous period. The whole Diagnosis can be filtered to the last 7 or 30 days.
- With an Anthropic API key, the AI report now uses that context too.

**Design**
- New visual identity with bundled typefaces (Source Serif 4 and IBM Plex Sans), a new palette and a new icon.
- Figurine notation (♘f3), Spanish letters (Cf3) or English letters (Nf3).
- Four board themes and four piece sets; light, dark or automatic theme.

**Product**
- One-click updates: the app checks GitHub for a new version, downloads it and installs itself.
- Open PGN files from the app, by dragging them onto the window or from the Finder; export all games.
- Backup and restore of all your data in one file, plus an automatic daily copy. A damaged data file is recovered from the latest copy.
- Full menu bar with keyboard shortcuts; a shortcuts sheet (press ?).
- Games: filters by result and time control, sorting by date or accuracy, and your record for what you are viewing.
- Play Stockfish: hints.

**Fixes**
- Writing notes during a self-review is no longer interrupted while the engine analyzes in the background.
- The move list no longer jumps back to the current move while a game is being analyzed.
- Openings are recognized from the moves when the PGN doesn't name them.

## 1.2.0 (2026-11-03)

- New name: **Analysis Board** (formerly "Mesa de Análisis"). Existing installs keep their games, progress and settings, and the app renames itself after the update.
- **English interface.** Choose English or Spanish in Settings → Language. New installs follow the Mac's language.
- Explanations, diagnosis, opening names, puzzle themes and endgame lessons are all available in both languages.
- "See versions on GitHub" in Settings and in the app menu.
- Fixes: more robust reading of PGNs with comments, variations and annotation symbols; games pasted from Lichess or Chess.com are recognized as duplicates of imported ones; small layout and wording fixes.

## 1.1.1

- Beta-testing fixes: puzzle rating after hints and skips, endgame progress, eval bar hidden during self-review, faster screens with large libraries, horizontal overflow in narrow windows.

## 1.1.0

- Coach features: Today plan with weekly focus and streak, diagnosis by mistake type, phase and clock, spaced-repetition exercises from your mistakes, threats trainer, Lichess puzzles recommended by your weak spots, endgame lessons, self-review before seeing the engine, and games against Stockfish at 10 levels.

---

## Novedades (en español)

### 2.0.0

Una actualización grande: diseño nuevo, un tablero de análisis completo y devoluciones escritas.

- **Motor en vivo** en cualquier posición, con varias líneas. Tocás una jugada para verla en el tablero; la barra espaciadora juega la que recomienda el motor, para el bando que mueva. Si querés, el motor responde solo a tus jugadas.
- **Árbol de variantes**: se ramifican y se anidan, quedan guardadas con la partida y salen en el PGN.
- **Tablero libre** para analizar una posición desde un FEN o cargar una partida a mano.
- **Coronación a elección**, relojes y material junto a cada jugador, copiar FEN y PGN, exportar a un archivo.
- **Devolución de cada partida**: cómo se desarrolló, qué la decidió, el reloj, tus errores por tipo, y cómo se compara con tus otras partidas de la semana y del mes.
- **Informe semanal y mensual** en Diagnóstico, comparado con el período anterior.
- **Diseño nuevo**: tipografías propias, paleta e ícono nuevos; notación con figurines o con letras en castellano; cuatro tableros y cuatro juegos de piezas; tema claro, oscuro o automático.
- **Actualización con un clic**, archivos PGN (abrir, arrastrar, exportar), copia de seguridad y restauración, menú completo con atajos, filtros y orden en Partidas, pistas contra Stockfish.
- Arreglos: las notas de la revisión propia ya no se interrumpen mientras el motor analiza; la planilla no salta mientras se analiza la partida; las aperturas se reconocen por las jugadas cuando el PGN no trae el nombre.

### 1.2.0

- Nombre nuevo: **Analysis Board** (antes "Mesa de Análisis"). Quien ya la usaba conserva partidas, progreso y ajustes, y la app se renombra sola después de actualizar.
- **Interfaz en inglés.** Elegí inglés o castellano en Ajustes → Idioma. Las instalaciones nuevas usan el idioma de la Mac.
- Explicaciones, diagnóstico, nombres de aperturas, temas de problemas y lecciones de finales en los dos idiomas.
- "Ver versiones en GitHub" en Ajustes y en el menú de la app.
- Arreglos: lectura más robusta de PGN con comentarios, variantes y signos de anotación; las partidas pegadas desde Lichess o Chess.com se reconocen como duplicadas de las importadas; detalles de diseño y de redacción.
