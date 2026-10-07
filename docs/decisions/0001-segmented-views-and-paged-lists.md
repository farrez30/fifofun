# 0001 — Long pages become segmented views; long lists become pages

- Date: 2026-10-07
- Status: Accepted

## Context
Five pages had grown far past a screen. Measured at 375×812: /peta 26,265 px
(32 screens), /pengaturan 17,171, / 13,544, /rencana 12,600, /laporan 9,369.
Two causes: long lists drawn whole (every place, every category, 168 waiting
merchants on "Tampilkan semua"), and pages stacking several independent jobs in
one scroll. The app is used mostly on a phone and already follows Apple's HIG
through one design system (`SEGMENTED` in `field-base.tsx`).

## Options considered
1. Segmented views per page (`?bagian=`) + paged lists (10–20 rows, search, numbered pages).
2. Collapsible sections on one page + paged lists.
3. Sticky "jump to" navigation + back-to-top + paged lists.
4. Paged lists only, page structure unchanged.

## Decision
Option 1, decided by: the owner. The dashboard (/) stays one scroll; only its
lists are cut, linking to the page that holds the rest.

## Reasoning (owner's words)
"Pola segmen dan daftar berhalaman sudah familiar dari aplikasi iPhone dan cocok
dengan gaya FiFoFun."

## Consequences
- `SegmentNav` (links; `onSelect` for the plan's client island), `Pager`
  (numbered window), `src/lib/paging.ts` and `src/lib/sections.ts` are shared.
- Server pages render only the open view; filters fold into a summary line.
- Category lists are shown one cashflow at a time instead of paged, because drag
  reordering only works across rows that are on screen.
- Deep links use `?bagian=` (and `?cashflow=` for settings).

## Revisit if
The owner mostly reads on a large monitor and wants everything at once, or a
view is opened so often from another that the extra tap becomes the cost.
