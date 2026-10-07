# 0003 — An online card payment can be placed by hand, never queued

- Date: 2026-10-07
- Status: Accepted

## Context
The map only keys payments made at a counter: QRIS, a home utility, a manual
entry. A card payment to a website ("Transaksi e-Commerce") had no key, so it
always sat under Online. That is right for a Google or Cursor bill, and wrong
for a stay booked online: the Pangandaran touring of 13–14 Dec 2025 left one
real trace, a Rp258.791 Agoda booking for Adams Home Stay, and the map showed
nothing there. 33 such payments came from 7 sites, 5 of them subscriptions.

## Options considered
1. Key them, but keep them out of the queue: placed only where someone puts a
   point, otherwise counted online as before.
2. Key them like QRIS: all 7 sites enter Menunggu; the subscriptions are
   marked Tanpa tempat by hand, and every new site after them.
3. No code: write the hotel and the nights in the transaction's note.

## Decision
Option 1, decided by: the owner, choosing "Bisa ditaruh, tanpa antrean".

## Reasoning (owner's choice)
The owner asked whether the Pangandaran trip left any food or hotel
transactions and wanted the hotel to show where the trip was, without the
Google and Cursor bills filling the queue.

## Consequences
- `placeKey` keys a card e-commerce payment by its merchant name
  (`agoda.com a`); `summarisePlaces` counts it as unplaceable, not waiting,
  when no point covers its day.
- A point for such a merchant should be dated: the same site books different
  hotels. It sits on the day the card was charged (10 Dec), not the nights
  stayed; those go in the transaction's note.
- Online still lists the payment: the money did go to Agoda in Singapore.
- There is no Taruh button for these yet; a point is added from the data.

## Revisit if
Online bookings become frequent enough that adding points by hand is a chore,
which would call for a Taruh action in the Online list.
