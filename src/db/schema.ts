import { relations, sql } from 'drizzle-orm'
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { CASHFLOW_TYPES } from '@/lib/ledger/types'

/**
 * Every table that holds user data carries `householdId`, and row level security
 * is written against it. That single rule is what makes it safe for this
 * repository to be public: the policies, not the client code, decide who can
 * read a row.
 *
 * Money is `bigint` throughout, counted in sen. Postgres `numeric` would also be
 * exact but arrives in JavaScript as a string; `bigint` keeps the arithmetic in
 * one type from the database to the UI.
 */

export const cashflowType = pgEnum('cashflow_type', CASHFLOW_TYPES)

export const accountKind = pgEnum('account_kind', [
  'bank',
  'ewallet',
  'cash',
  'emoney',
  'investment',
])

export const entrySource = pgEnum('entry_source', ['xlsx', 'email', 'manual', 'telegram'])

export const memberRole = pgEnum('member_role', ['owner', 'member'])

export const importStatus = pgEnum('import_status', ['pending', 'reconciled', 'failed'])

export const households = pgTable('households', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  /** IANA zone; all reporting boundaries are computed in this zone. */
  timezone: text('timezone').notNull().default('Asia/Jakarta'),
  currency: text('currency').notNull().default('IDR'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const householdMembers = pgTable(
  'household_members',
  {
    householdId: uuid('household_id')
      .notNull()
      .references(() => households.id, { onDelete: 'cascade' }),
    /** References auth.users(id), which Drizzle does not model. */
    userId: uuid('user_id').notNull(),
    role: memberRole('role').notNull().default('member'),
    displayName: text('display_name'),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('household_members_pkey').on(table.householdId, table.userId),
    index('household_members_user_idx').on(table.userId),
  ],
)

export const accounts = pgTable(
  'accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    householdId: uuid('household_id')
      .notNull()
      .references(() => households.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    kind: accountKind('kind').notNull(),
    openingBalance: bigint('opening_balance', { mode: 'bigint' }).notNull().default(sql`0`),
    openingBalanceAt: timestamp('opening_balance_at', { withTimezone: true }),
    /** Masked account number, used to attach an imported statement to an account. */
    reference: text('reference'),
    institution: text('institution'),
    /**
     * Identifiers that mark a movement as this household's own money: phone
     * numbers behind e-wallet biller prefixes, e-money card numbers.
     */
    ownIdentifiers: text('own_identifiers').array().notNull().default([]),
    sortOrder: integer('sort_order').notNull().default(0),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
  },
  (table) => [index('accounts_household_idx').on(table.householdId)],
)

export const categories = pgTable(
  'categories',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    householdId: uuid('household_id')
      .notNull()
      .references(() => households.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    cashflow: cashflowType('cashflow').notNull(),
    /** Opening balance for savings, sinking fund and goal buckets. */
    openingBalance: bigint('opening_balance', { mode: 'bigint' }).notNull().default(sql`0`),
    /**
     * What this pot is aiming at, and the month it is wanted by. Only savings,
     * sinking funds and goals have either. The spreadsheet kept the pair beside
     * every goal and worked out the rest by hand; both figures here are still a
     * decision the household makes, and everything derived from them is read
     * back out of the ledger.
     */
    targetAmount: bigint('target_amount', { mode: 'bigint' }),
    /** `YYYY-MM`, or null for a pot with no deadline. */
    targetMonth: text('target_month'),
    icon: text('icon'),
    color: text('color'),
    sortOrder: integer('sort_order').notNull().default(0),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
  },
  (table) => [
    // The spreadsheet needed category names to be unique across every cashflow
    // type because it matched them by text. Scoping the constraint to the
    // cashflow type removes that limitation without losing the safeguard.
    uniqueIndex('categories_unique_name').on(table.householdId, table.cashflow, table.name),
  ],
)

export const importBatches = pgTable(
  'import_batches',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    householdId: uuid('household_id')
      .notNull()
      .references(() => households.id, { onDelete: 'cascade' }),
    accountId: uuid('account_id').references(() => accounts.id, { onDelete: 'set null' }),
    filename: text('filename').notNull(),
    /** SHA-256 of the uploaded file, which makes re-uploading it idempotent. */
    fileHash: text('file_hash').notNull(),
    format: text('format').notNull(),
    periodStart: timestamp('period_start', { withTimezone: true }),
    periodEnd: timestamp('period_end', { withTimezone: true }),
    openingBalance: bigint('opening_balance', { mode: 'bigint' }),
    closingBalance: bigint('closing_balance', { mode: 'bigint' }),
    rowCount: integer('row_count').notNull().default(0),
    status: importStatus('status').notNull().default('pending'),
    /** Reconciliation failures, kept so an import can be explained later. */
    issues: jsonb('issues').notNull().default([]),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('import_batches_file_unique').on(table.householdId, table.fileHash),
    index('import_batches_household_idx').on(table.householdId),
  ],
)

export const transactions = pgTable(
  'transactions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    householdId: uuid('household_id')
      .notNull()
      .references(() => households.id, { onDelete: 'cascade' }),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    description: text('description').notNull(),
    /** Always positive; direction comes from the cashflow type and the accounts. */
    amount: bigint('amount', { mode: 'bigint' }).notNull(),
    cashflow: cashflowType('cashflow').notNull(),
    categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'set null' }),
    fromAccountId: uuid('from_account_id').references(() => accounts.id, { onDelete: 'restrict' }),
    toAccountId: uuid('to_account_id').references(() => accounts.id, { onDelete: 'restrict' }),
    source: entrySource('source').notNull(),
    /** Bank reference; joins an email notification to its statement row. */
    externalRef: text('external_ref'),
    /** Links a bank fee to the transaction it was charged for. */
    feeParentId: uuid('fee_parent_id'),
    importBatchId: uuid('import_batch_id').references(() => importBatches.id, {
      onDelete: 'set null',
    }),
    /**
     * Stable hash of the source row, so importing the same statement twice, or
     * importing a statement that overlaps an email already recorded, does not
     * create a duplicate.
     */
    dedupeKey: text('dedupe_key'),
    note: text('note'),
    /** Money that only passed through the account on somebody else's behalf. */
    isPassThrough: boolean('is_pass_through').notNull().default(false),
    /** Set until a human has confirmed a low-confidence classification. */
    needsReview: boolean('needs_review').notNull().default(false),
    /**
     * When a person settled this row's category, either directly or by writing a
     * rule that covers it. Null means the category is still the importer's guess.
     *
     * `needs_review` cannot answer this. It marks rows the classifier was unsure
     * about, and the classifier is most confident exactly where it is least
     * useful: it knows a QRIS payment is a QRIS payment and files it under a
     * default category with full confidence, which is a guess nobody agreed to.
     */
    confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
    /** Untouched source text, kept because bank formats change without notice. */
    rawDescription: text('raw_description'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    index('transactions_household_time_idx').on(table.householdId, table.occurredAt),
    index('transactions_category_idx').on(table.categoryId),
    index('transactions_review_idx').on(table.householdId, table.needsReview),
    index('transactions_confirmed_idx').on(table.householdId, table.confirmedAt),
    uniqueIndex('transactions_dedupe_unique').on(table.householdId, table.dedupeKey),
  ],
)

export const categorizationRules = pgTable(
  'categorization_rules',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    householdId: uuid('household_id')
      .notNull()
      .references(() => households.id, { onDelete: 'cascade' }),
    /** Lower runs first, so a specific rule can pre-empt a general one. */
    priority: integer('priority').notNull().default(100),
    matchType: text('match_type').notNull(),
    pattern: text('pattern').notNull(),
    cashflow: cashflowType('cashflow'),
    categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'cascade' }),
    toAccountId: uuid('to_account_id').references(() => accounts.id, { onDelete: 'set null' }),
    /** Apply silently, or only suggest and wait for confirmation. */
    autoApply: boolean('auto_apply').notNull().default(true),
    hitCount: integer('hit_count').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('categorization_rules_household_idx').on(table.householdId, table.priority)],
)

export const budgets = pgTable(
  'budgets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    householdId: uuid('household_id')
      .notNull()
      .references(() => households.id, { onDelete: 'cascade' }),
    /** Calendar month as YYYY-MM in the household's own timezone. */
    period: text('period').notNull(),
    categoryId: uuid('category_id')
      .notNull()
      .references(() => categories.id, { onDelete: 'cascade' }),
    amount: bigint('amount', { mode: 'bigint' }).notNull(),
    source: text('source').notNull().default('manual'),
  },
  (table) => [uniqueIndex('budgets_unique').on(table.householdId, table.period, table.categoryId)],
)

export const householdsRelations = relations(households, ({ many }) => ({
  members: many(householdMembers),
  accounts: many(accounts),
  categories: many(categories),
  transactions: many(transactions),
}))

export const transactionsRelations = relations(transactions, ({ one }) => ({
  household: one(households, {
    fields: [transactions.householdId],
    references: [households.id],
  }),
  category: one(categories, {
    fields: [transactions.categoryId],
    references: [categories.id],
  }),
  fromAccount: one(accounts, {
    fields: [transactions.fromAccountId],
    references: [accounts.id],
    relationName: 'fromAccount',
  }),
  toAccount: one(accounts, {
    fields: [transactions.toAccountId],
    references: [accounts.id],
    relationName: 'toAccount',
  }),
}))

export const accountsRelations = relations(accounts, ({ one }) => ({
  household: one(households, {
    fields: [accounts.householdId],
    references: [households.id],
  }),
}))

export const categoriesRelations = relations(categories, ({ one, many }) => ({
  household: one(households, {
    fields: [categories.householdId],
    references: [households.id],
  }),
  transactions: many(transactions),
}))
