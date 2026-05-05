# Chess.com Moves to Clipboard

A small Firefox extension that copies the move list from any Chess.com game to your clipboard. Works on daily, live, analysis, and archived games.

## Install

This extension is not yet signed for distribution on addons.mozilla.org. To use it, sideload as a temporary add-on:

1. Clone this repo (or download the ZIP and extract).
2. Open `about:debugging#/runtime/this-firefox` in Firefox.
3. Click **Load Temporary Add-on…**
4. Pick `manifest.json` from the repo folder.

The extension persists until Firefox restarts.

## Use

1. Open any Chess.com game page (daily, live, analysis, archive).
2. Click the knight icon in the toolbar to open the popup.
3. Pick output format and notation, then click **Copy moves**:
   - **Format** — one pair per line (default), PGN single line, or PGN with `{[%clk ...]}` timestamps.
   - **Notation** — standard (`Nc3`, `Bxf6`) or figurine (`♞c3`, `♝xf6`).
4. Paste into Lichess, an analysis tool, a chat with a coach or AI, or wherever else.

A green ✓ badge confirms the copy; a red ✗ badge appears if the page has no move list.

## Permissions

Only what the job needs:

- `activeTab` — read the current tab's DOM when you click the button.
- `scripting` — inject the extractor function.
- `storage` — remember your format/notation preferences.

No `host_permissions`, no clipboard permission, no network access. Nothing leaves your browser.

## Scope and limitations

- Main game line only — variations from analysis trees are skipped.
- The result line (`1-0`, `0-1`, `1/2-1/2`) is appended only for finished games.
- Temporary sideload only for now; signed distribution is future work.

## License

MIT — see [LICENSE](LICENSE).
