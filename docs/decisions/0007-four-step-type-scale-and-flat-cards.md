# 0007 — Four-step type scale and flat bordered cards

- Date: 2026-11-02
- Status: Accepted

## Context

The UI follows Apple's Dynamic Type roles (seven sizes in use, `text-caption2`
to `text-title1`) and grouped cards that separate by `shadow-xs`
(`docs/DESIGN.md` §2 and §4). Farrez is applying the "Two-Pass Anti-AI-Slop UI
Refactor" SOP across his apps: strip explanatory copy and decoration, then lock
type to four steps and flatten cards. The SOP was written for shadcn; here it
meets a design system that `type-roles.test.ts` enforces.

## Options considered

1. Keep the Cupertino identity and map the SOP onto it (roles stay, only the
   copy pass and nested-surface rule apply).
2. Full SOP: `text-xl` / `text-sm` / `text-xs` scale, cards with a 1px border
   instead of a shadow. Glass chrome, Phosphor icons, the teal accent, the font
   stack and squircle corners stay.
3. Option 1 plus a stricter HIG audit (`hig-doctor`) per module.

## Decision

Option 2, decided by Farrez. Inputs keep 16px on phones (the iOS zoom floor
`e2e/mobile.spec.ts` guards).

## Reasoning

"saya ingin supaya lebih menarik dan mudah dibaca"

## Consequences

- The scale is: page title `text-xl font-semibold`, section title
  `text-sm font-medium`, body `text-sm`, metadata `text-xs` muted, and one
  verdict figure per screen at `text-2xl` tabular. The fifth size was added
  after measuring Monarch, Copilot, YNAB and Rocket Money: all four lead with a
  figure larger than their body text (references in coderoach-referensi,
  `dipakai_di: fifofun ADR 0007`). Stripe Apps' four tokens back the rest.
- Definitions of a figure or column move into an `InfoTip` (native popover);
  sentences about the state of the data stay visible.
- Rolled out one module per PR. `type-roles.test.ts` holds both rules during the
  move: files listed in `FOUR_STEP` may only use the new scale, everything else
  keeps the old one. The list grows each PR; the last PR deletes the old roles
  from `globals.css` and rewrites `docs/DESIGN.md` §2 and §4.
- Revisit if the 14px body reads too small on the phone, which is where the
  ledger is used most.
