# Typography

Analysis Board 2.1 uses three open typefaces, all bundled with the app (SIL Open Font License 1.1):

| Role | Typeface | Author |
|---|---|---|
| Interface and notation | [Asap](https://github.com/Omnibus-Type/Asap) | Omnibus-Type, Buenos Aires |
| Headings and large figures | [Piazzolla](https://github.com/huertatipografica/piazzolla) | Juan Pablo del Peral, Huerta Tipográfica |
| FEN and PGN text | [Chivo Mono](https://github.com/Omnibus-Type/Chivo) | Omnibus-Type, Buenos Aires |
| Figurines (♘♗♖♕♔) | Noto Sans Symbols 2 (subset) | Google |

## How they were chosen

37 open variable families were measured, plus the two the app used in 2.0 (IBM Plex Sans, Source Serif 4) as a baseline. The scripts are short and reproducible: read the font tables with fontTools, then render in Chromium and measure.

**Excluded up front**

- The system font (used until 1.2) and the 2.0 pair.
- Families that have become the default look of generated interfaces: Inter, Roboto, Open Sans, Space Grotesk, Geist, Instrument Serif, and their usual companions (DM Sans, Manrope, Fraunces, Playfair Display, Newsreader).
- What the two big chess sites use, so the app does not look like either: Chess.com (its own Chess Sans over the system font) and Lichess (Noto Sans).

**Required**

- Open license compatible with a GPL app, and a variable font so one file covers every weight.
- Tabular figures, because evaluations, clocks and ratings sit in columns.
- A true italic and the Spanish character set.

**Measured for the interface face** (13.5 px, the app's text size)

| Family | Width of a move line (px) | Width change regular → semibold | x-height / cap height | I vs l differ |
|---|---|---|---|---|
| **Asap** | **598** | **0.0 %** | 0.75 | 0.40 |
| IBM Plex Sans (2.0) | 651 | 1.5 % | 0.74 | 0.85 |
| Archivo | 635 | 1.9 % | 0.77 | 0.40 |
| Radio Canada | 649 | 1.9 % | 0.74 | 0.89 |
| Chivo | 656 | 0.2 % | 0.74 | 0.74 |
| Atkinson Hyperlegible Next | 663 | 3.3 % | 0.73 | 0.86 |
| Schibsted Grotesk | 729 | 0.0 % | 0.75 | 0.74 |
| Noto Sans (Lichess) | 647 | 1.3 % | 0.74 | 0.64 |

The move line is `14. Nf3 Qxd5 15. O-O-O exd4 16. Rhe1+ Kf8 17. Bb5 a6 18. Bxc6 bxc6 19. e8=Q# +0.35 −1.20 78.4% 5:32`.

Asap won on the two things that matter most in a move list:

- **Its letters keep the same width in every weight.** The current move is shown in bold; with any other family that makes the line reflow as you step through a game. With Asap it does not move.
- **It is the most compact legible option**, 8 % narrower than the 2.0 face, so an engine line shows about one more move in the same panel.

Its weak point is that capital I and lowercase l are similar. Neither letter occurs in chess notation, and Schibsted Grotesk and Atkinson, which separate them better, were ruled out for other reasons: Schibsted is 22 % wider and its tabular figures also widen commas and full stops; Atkinson reflows 3.3 % in bold.

**Measured for the heading face**

| Family | Stroke contrast | Figures | Optical size axis | I vs l differ |
|---|---|---|---|---|
| **Piazzolla** | **1.4** | cap-height, no descenders | **8–30** | 0.80 |
| Source Serif 4 (2.0) | 3.2 | lining | 8–60 | 0.44 |
| Manuale | 1.7 | lining | no | 0.49 |
| Faustina | 1.4 | lining | no | 0.61 |
| Alegreya | 1.4 | old-style by default | no | 0.81 |
| Literata | 5.5 | lining | 7–72 | 0.53 |

Headings in the app are small (15 to 30 px) and many of them are numbers or moves (`12… dxe4`, `85 %`). Piazzolla has low stroke contrast, so thin strokes do not disappear at 15 px; an optical-size axis that covers exactly that range; and figures that stand at capital height without descenders, so they read as numbers and line up with the figurines.

Finally, the eight best pairings were rendered inside the real app (report, move list, diagnosis) and compared side by side before deciding.

Both families come from Argentine type foundries, like the app.
