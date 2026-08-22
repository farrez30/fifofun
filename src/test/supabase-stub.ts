import { vi } from 'vitest'

/**
 * A stand-in for the Supabase client, for testing server actions.
 *
 * Every action in this app is a sequence of small queries whose order and
 * scoping is the thing worth asserting: that the household id is on every
 * write, that a category is re-read from the database rather than trusted from
 * the form, that a refusal is detected. A stub that records calls and hands
 * back queued answers tests exactly that, without a database.
 *
 * The chain is deliberately permissive. Real PostgREST accepts these in almost
 * any order, and a stub that insisted on one would fail for a reason that has
 * nothing to do with the action being tested.
 */

export interface StubResponse {
  data?: unknown
  error?: { message: string; code?: string } | null
  count?: number | null
}

export interface RecordedCall {
  table: string
  /** Method names in the order they were chained, e.g. `select`, `eq`, `single`. */
  chain: string[]
  /** The arguments of each chained call, positionally aligned with `chain`. */
  args: unknown[][]
  /** The payload of an insert, update or upsert. */
  payload?: unknown
}

const CHAINABLE = [
  'select',
  'eq',
  'neq',
  'in',
  'is',
  'not',
  'or',
  'gt',
  'gte',
  'lt',
  'lte',
  'ilike',
  'like',
  'order',
  'range',
  'limit',
] as const

const TERMINAL = ['single', 'maybeSingle'] as const
const WRITES = ['insert', 'update', 'upsert', 'delete'] as const

export interface SupabaseStub {
  client: {
    auth: { getUser: () => Promise<{ data: { user: { id: string } | null } }> }
    from: (table: string) => unknown
    rpc: ReturnType<typeof vi.fn>
  }
  /** Answers handed out in order, per table. */
  queue: (table: string, ...responses: StubResponse[]) => void
  calls: RecordedCall[]
  /** Every call against one table, in order. */
  callsOn: (table: string) => RecordedCall[]
  setUser: (user: { id: string } | null) => void
  /** Forget every queued answer and every recorded call. */
  reset: () => void
}

export function createSupabaseStub(options: { user?: { id: string } | null } = {}): SupabaseStub {
  let user: { id: string } | null = options.user === undefined ? { id: 'u1' } : options.user
  const responses = new Map<string, StubResponse[]>()
  const calls: RecordedCall[] = []

  function answer(table: string): StubResponse {
    const queued = responses.get(table)
    const next = queued?.shift()
    return next ?? { data: null, error: null }
  }

  function builder(table: string) {
    const call: RecordedCall = { table, chain: [], args: [] }
    calls.push(call)

    const settle = () => {
      const response = answer(table)
      return {
        data: response.data ?? null,
        error: response.error ?? null,
        count: response.count ?? null,
      }
    }

    const proxy: Record<string, unknown> = {
      // A query is a thenable, so `await supabase.from(...).select(...)` works
      // without a terminal method.
      then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
        Promise.resolve(settle()).then(resolve, reject),
    }

    for (const method of CHAINABLE) {
      proxy[method] = (...args: unknown[]) => {
        call.chain.push(method)
        call.args.push(args)
        return proxy
      }
    }

    for (const method of TERMINAL) {
      proxy[method] = async (...args: unknown[]) => {
        call.chain.push(method)
        call.args.push(args)
        return settle()
      }
    }

    for (const method of WRITES) {
      proxy[method] = (...args: unknown[]) => {
        call.chain.push(method)
        call.args.push(args)
        if (method !== 'delete') call.payload = args[0]
        return proxy
      }
    }

    return proxy
  }

  return {
    client: {
      auth: { getUser: async () => ({ data: { user } }) },
      from: (table: string) => builder(table),
      rpc: vi.fn(async () => ({ data: null, error: null })),
    },
    queue: (table, ...values) => {
      responses.set(table, [...(responses.get(table) ?? []), ...values])
    },
    calls,
    callsOn: (table) => calls.filter((call) => call.table === table),
    setUser: (next) => {
      user = next
    },
    reset: () => {
      responses.clear()
      calls.length = 0
    },
  }
}

/** The arguments of one chained call, for asserting how a query was scoped. */
export function argsFor(call: RecordedCall, method: string): unknown[][] {
  return call.args.filter((_, index) => call.chain[index] === method)
}
