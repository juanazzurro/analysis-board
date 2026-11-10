# Changelog

## 2.1.0 (2026-11-10)

Faster with big libraries, a real opening book, your own comments, and a new pair of typefaces.

**Speed and reliability**
- The app no longer freezes on launch with a large library. With 1,000 games the window used to hang for about 27 seconds; now it is usable in under 2 and the rest is prepared in the background (reading a game is also 2.4 times faster).
- Changing the language no longer recalculates the whole diagnosis.
- Errors nobody caught are written to a log instead of being lost; if the window crashes it reloads itself. Settings → Help can export that log (no games, usernames or keys in it) and open a problem report.
- Updates are checked against the SHA-256 that GitHub publishes for the file; a download that doesn't match is not installed.
- Your data files can only be read by your macOS user, and the API key is no longer copied into the automatic daily backups.

**Chess**
- Opening book with 3,865 named openings (the Lichess table): exact name and ECO code for every game, recognised by position, so transpositions count. Book moves are marked as such, and the report says where the game left known theory.
- Your own comments on any move, in the game or in a variation. They are saved with the game and exported in the PGN.
- Exported PGNs now carry the engine evaluation of every move and the usual symbols for inaccuracies, mistakes and blunders.
- New games come in by themselves when the app opens (can be turned off), and there is a "Get new games" button. Import up to 1,000 games at once.
- Type a move instead of dragging (press M: Nf3, e4, O-O).

**Using it**
- Removing a game can be undone.
- A sample game to try the app without importing anything.
- A system notification when a batch of games finishes analyzing and the window is in the background.
- Copy the game report as text.
- Text size setting; visible keyboard focus; the current move is announced to screen readers.

**Design**
- New typefaces, chosen by measuring 37 open families inside the app: Asap for the interface (its letters keep the same width in bold, so the move list doesn't shift when you step through a game) and Piazzolla for headings. Both come from Argentine foundries. The reasoning and the numbers are in docs/TYPOGRAPHY.md.
- The logo in the sidebar is now the same drawing as the app icon.

**Project**
- The interface tests are in the repository and run on every push, on Linux and on an Apple Silicon Mac, where the packaged app is tested for real: launch, native engine, opening a .pgn from the Finder and installing an update.
- Publishing a release builds the app on a Mac and attaches it automatically.

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

### 2.1.0

Más rápida con bibliotecas grandes, un libro de aperturas de verdad, comentarios propios y tipografías nuevas.

- **Ya no se congela al abrir** con muchas partidas: con 1.000, la ventana quedaba trabada unos 27 segundos; ahora se puede usar en menos de 2 y el resto se prepara de fondo. Cambiar de idioma ya no recalcula el diagnóstico.
- **Libro de aperturas** con 3.865 aperturas: nombre exacto y código ECO de cada partida (también por transposición), jugadas "de libro" marcadas, y la devolución dice dónde la partida salió de la teoría.
- **Comentarios propios** en cualquier jugada, guardados con la partida. El PGN exportado ahora lleva tus comentarios, la evaluación del motor en cada jugada y los signos de imprecisión, error y blunder.
- **Las partidas nuevas llegan solas** al abrir la app (se puede apagar), hay un botón "Traer nuevas" y se pueden importar hasta 1.000 de una vez.
- **Escribir una jugada** en vez de arrastrar la pieza (tecla M: Cf3, e4, O-O).
- **Deshacer** al quitar una partida, una **partida de ejemplo** para probar la app, **aviso del sistema** cuando termina de analizar una tanda, **copiar la devolución** como texto, **tamaño del texto** ajustable.
- **Si algo falla**, queda en un registro que se exporta desde Ajustes → Ayuda (sin partidas, usuarios ni claves); si la ventana se cae, se recarga sola.
- **Actualizaciones verificadas** con la huella SHA-256 que publica GitHub. Tus archivos de datos solo los puede leer tu usuario de la Mac.
- **Tipografías nuevas**, elegidas midiendo 37 familias abiertas dentro de la app: Asap para la interfaz (sus letras no cambian de ancho en negrita, así la planilla no se mueve al recorrer la partida) y Piazzolla para los títulos, las dos de fundidoras argentinas. El porqué está en docs/TYPOGRAPHY.md.
- **El logo** de la barra lateral ahora es el mismo dibujo que el ícono de la app.
- Las pruebas de interfaz están en el repositorio y corren en cada cambio, también sobre una Mac, donde se prueba la app empaquetada: arranque, motor, abrir un .pgn desde el Finder e instalar una actualización.

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
