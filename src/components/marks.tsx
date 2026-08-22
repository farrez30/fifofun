import { ArrowDownLeft } from '@phosphor-icons/react/dist/ssr/ArrowDownLeft'
import { ArrowUpRight } from '@phosphor-icons/react/dist/ssr/ArrowUpRight'
import { ArrowsLeftRight } from '@phosphor-icons/react/dist/ssr/ArrowsLeftRight'
import { Bank } from '@phosphor-icons/react/dist/ssr/Bank'
import { Barbell } from '@phosphor-icons/react/dist/ssr/Barbell'
import { Bed } from '@phosphor-icons/react/dist/ssr/Bed'
import { Briefcase } from '@phosphor-icons/react/dist/ssr/Briefcase'
import { Bus } from '@phosphor-icons/react/dist/ssr/Bus'
import { Car } from '@phosphor-icons/react/dist/ssr/Car'
import { ChartLine } from '@phosphor-icons/react/dist/ssr/ChartLine'
import { ChartLineUp } from '@phosphor-icons/react/dist/ssr/ChartLineUp'
import { CloudArrowUp } from '@phosphor-icons/react/dist/ssr/CloudArrowUp'
import { Coins } from '@phosphor-icons/react/dist/ssr/Coins'
import { Confetti } from '@phosphor-icons/react/dist/ssr/Confetti'
import { Cookie } from '@phosphor-icons/react/dist/ssr/Cookie'
import { CreditCard } from '@phosphor-icons/react/dist/ssr/CreditCard'
import { DeviceMobile } from '@phosphor-icons/react/dist/ssr/DeviceMobile'
import { Drop } from '@phosphor-icons/react/dist/ssr/Drop'
import { FirstAid } from '@phosphor-icons/react/dist/ssr/FirstAid'
import { ForkKnife } from '@phosphor-icons/react/dist/ssr/ForkKnife'
import { GasPump } from '@phosphor-icons/react/dist/ssr/GasPump'
import { Gift } from '@phosphor-icons/react/dist/ssr/Gift'
import { GraduationCap } from '@phosphor-icons/react/dist/ssr/GraduationCap'
import { HandCoins } from '@phosphor-icons/react/dist/ssr/HandCoins'
import { HandHeart } from '@phosphor-icons/react/dist/ssr/HandHeart'
import { Handshake } from '@phosphor-icons/react/dist/ssr/Handshake'
import { Heart } from '@phosphor-icons/react/dist/ssr/Heart'
import { House } from '@phosphor-icons/react/dist/ssr/House'
import { Invoice } from '@phosphor-icons/react/dist/ssr/Invoice'
import { Key } from '@phosphor-icons/react/dist/ssr/Key'
import { Laptop } from '@phosphor-icons/react/dist/ssr/Laptop'
import { Lightning } from '@phosphor-icons/react/dist/ssr/Lightning'
import { MusicNote } from '@phosphor-icons/react/dist/ssr/MusicNote'
import { PiggyBank } from '@phosphor-icons/react/dist/ssr/PiggyBank'
import { Receipt } from '@phosphor-icons/react/dist/ssr/Receipt'
import { Scales } from '@phosphor-icons/react/dist/ssr/Scales'
import { ShieldCheck } from '@phosphor-icons/react/dist/ssr/ShieldCheck'
import { ShoppingBag } from '@phosphor-icons/react/dist/ssr/ShoppingBag'
import { Storefront } from '@phosphor-icons/react/dist/ssr/Storefront'
import { Tag } from '@phosphor-icons/react/dist/ssr/Tag'
import { Target } from '@phosphor-icons/react/dist/ssr/Target'
import { Television } from '@phosphor-icons/react/dist/ssr/Television'
import { Users } from '@phosphor-icons/react/dist/ssr/Users'
import { Vault } from '@phosphor-icons/react/dist/ssr/Vault'
import { Wallet } from '@phosphor-icons/react/dist/ssr/Wallet'
import { WifiHigh } from '@phosphor-icons/react/dist/ssr/WifiHigh'
import type { Icon } from '@phosphor-icons/react'
import {
  ACCOUNT_KIND_LABELS,
  DIRECTION_LABELS,
  type Direction,
  toneOf,
} from '@/lib/ledger/direction'
import { categoryHue, categoryIcon } from '@/lib/ledger/palette'
import type { FlowTone } from '@/components/chart/sankey'
import { CASHFLOW_LABELS, type AccountKind, type CashflowType } from '@/lib/ledger/types'

/**
 * Direction, cashflow, category and account, each with a mark a reader can
 * recognise before reading a word.
 *
 * The first icons in this repository, so this is where the convention is set.
 * Every icon comes from Phosphor's `ssr` entry, which renders plain SVG and
 * reads no context, so one module serves a Server Component and a client
 * island alike; the package root would fail in the former. Every icon is
 * `aria-hidden`, sized `size-4`, coloured by `currentColor`, and accompanied
 * by real text, visible or `sr-only`. Nothing in this app is knowable from a
 * shape or a hue alone.
 *
 * The registry is the only place the package is imported. A category stores an
 * icon by name, and a name nobody registered falls back to its cashflow's own
 * rather than rendering nothing.
 */

export const ICONS = {
  ArrowDownLeft,
  ArrowUpRight,
  ArrowsLeftRight,
  Bank,
  Barbell,
  Bed,
  Briefcase,
  Bus,
  Car,
  ChartLine,
  ChartLineUp,
  CloudArrowUp,
  Coins,
  Confetti,
  Cookie,
  CreditCard,
  DeviceMobile,
  Drop,
  FirstAid,
  ForkKnife,
  GasPump,
  Gift,
  GraduationCap,
  HandCoins,
  HandHeart,
  Handshake,
  Heart,
  House,
  Invoice,
  Key,
  Laptop,
  Lightning,
  MusicNote,
  PiggyBank,
  Receipt,
  Scales,
  ShieldCheck,
  ShoppingBag,
  Storefront,
  Tag,
  Target,
  Television,
  Users,
  Vault,
  Wallet,
  WifiHigh,
} satisfies Record<string, Icon>

export type IconName = keyof typeof ICONS

/** Every icon a category may be given, for the picker in settings. */
export const ICON_NAMES = Object.keys(ICONS) as IconName[]

const TONE_TEXT: Record<FlowTone, string> = {
  income: 'text-under',
  spend: 'text-ink',
  save: 'text-accent',
  warn: 'text-warn',
  neutral: 'text-ink-muted',
}

const TONE_CHIP: Record<FlowTone, string> = {
  income: 'border-under/40 bg-under-wash',
  spend: 'border-line bg-sunken',
  save: 'border-accent/40 bg-accent-wash',
  warn: 'border-warn/40 bg-warn-wash',
  neutral: 'border-line bg-sunken',
}

const DIRECTION_ICON: Record<Direction, IconName> = {
  in: 'ArrowDownLeft',
  out: 'ArrowUpRight',
  neither: 'ArrowsLeftRight',
}

const DIRECTION_TONE: Record<Direction, FlowTone> = {
  in: 'income',
  out: 'spend',
  neither: 'neutral',
}

const ACCOUNT_ICON: Record<AccountKind, IconName> = {
  bank: 'Bank',
  ewallet: 'Wallet',
  cash: 'Coins',
  emoney: 'CreditCard',
  investment: 'ChartLineUp',
}

/** Which way the money went, as an arrow and as a word. */
export function DirectionMark({
  direction,
  className = '',
}: {
  direction: Direction
  className?: string
}) {
  const Glyph = ICONS[DIRECTION_ICON[direction]]
  return (
    <span
      data-mark="direction"
      className={`inline-flex items-center ${TONE_TEXT[DIRECTION_TONE[direction]]} ${className}`}
    >
      <Glyph aria-hidden="true" weight="regular" className="size-4 shrink-0" />
      <span className="sr-only">{DIRECTION_LABELS[direction]}</span>
    </span>
  )
}

/** What kind of movement a row is, in the spreadsheet's own vocabulary. */
export function CashflowChip({
  cashflow,
  className = '',
}: {
  cashflow: CashflowType
  className?: string
}) {
  return (
    <span
      data-mark="cashflow"
      className={`inline-flex items-center rounded-xs border px-1.5 py-0.5 text-xs text-ink ${TONE_CHIP[toneOf(cashflow)]} ${className}`}
    >
      {CASHFLOW_LABELS[cashflow]}
    </span>
  )
}

/**
 * A category, as a swatch, an icon and its name.
 *
 * The hue is identity, not meaning: it makes the same category recognisable
 * across the flow diagram, the review queue and the budget table. Lightness
 * and chroma come from the theme, so one stored hue is correct in both.
 */
export function CategoryMark({
  name,
  cashflow,
  icon,
  hue,
  className = '',
}: {
  name: string
  cashflow: CashflowType
  icon: string | null
  hue: number | null
  className?: string
}) {
  const iconName = categoryIcon({ cashflow, icon }) as IconName
  const Glyph = ICONS[iconName] ?? ICONS[categoryIcon({ cashflow, icon: null }) as IconName]

  return (
    // No colour of its own: a mark is dropped into a table cell, a chip and a
    // selected tab with an accent behind it, and a fixed ink would fail the
    // contrast check on the last of those.
    <span data-mark="category" className={`inline-flex items-center gap-1.5 ${className}`}>
      <span
        aria-hidden="true"
        data-hue={categoryHue({ name, hue })}
        className="size-2.5 shrink-0 rounded-xs border border-line"
        style={{
          backgroundColor: `oklch(var(--category-l) var(--category-c) ${categoryHue({ name, hue })})`,
        }}
      />
      <Glyph aria-hidden="true" weight="regular" className="size-4 shrink-0 opacity-70" />
      <span className="min-w-0 truncate">{name}</span>
    </span>
  )
}

/** An account, as its kind and its name. */
export function AccountMark({
  name,
  kind,
  className = '',
}: {
  name: string
  kind: AccountKind
  className?: string
}) {
  const Glyph = ICONS[ACCOUNT_ICON[kind]]
  return (
    <span data-mark="account" className={`inline-flex items-center gap-1.5 ${className}`}>
      <Glyph aria-hidden="true" weight="regular" className="size-4 shrink-0 opacity-70" />
      <span className="min-w-0 truncate">{name}</span>
      <span className="sr-only">, {ACCOUNT_KIND_LABELS[kind]}</span>
    </span>
  )
}
