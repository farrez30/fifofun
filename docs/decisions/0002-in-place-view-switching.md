# 0002 — Map and report switch their views in place

- Date: 2026-10-07
- Status: Accepted (amends 0001)

## Context
After 0001, every view of /peta and /laporan was a separate server render
behind `?bagian=`. The design critique the same day measured what that cost: a
tap on a segment waited 0.6–0.8 s for a round trip whose data the page had
already loaded (the map holds every point, the report every matched row), and
the views were reached through numbered pages only.

## Options considered
1. Keep server-rendered views; rely on transitions and the pending dot.
2. Render every view once, hide the closed ones, switch on the client with the
   address mirrored (pushState/popstate), as the plan page already did.
3. Fetch each view on demand from the client (route handlers or server actions).

## Decision
Option 2, decided by: the owner, choosing "Peta & Laporan instan" from the
critique's follow-ups, together with "Bernomor + lompat bulan" and drill-down
breakdowns.

## Reasoning (owner's choice, from the critique)
Switching between views of data already on the page should not cost a round
trip. Numbered pages stay, with a month jump for the transaction list and a
page wheel on phones.

## Consequences
- `ViewSwitch` renders all views; `hidden` closes the others. A filter form
  receives the open view through `<input form=…>`.
- Places and waiting merchants page and search in the browser (`tempat-cari`,
  `tempat-hal`, `cari`, `hal` mirrored with replaceState); transactions stay
  server-paged, with `monthPages` driving "Lompat ke bulan".
- The map is created even when hidden, so `PlaceMap` resizes on a
  `ResizeObserver` and frames the points when it first gets a size.
- Breakdown lines link to the transaction list with the filter kept.

## Revisit if
The first load of /peta or /laporan grows noticeably slower because of the
closed views, or the matched set grows past what one page render should hold.
