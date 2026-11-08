import {
  estimateNeuronUsageForModel,
  GEMMA_MODEL,
  QWEN_MODEL,
  type ReportedTokenUsage,
  type SupportedModel,
} from './ai.ts';
import {
  RecoveryLedger, EXECUTION_LEASE_MS, LEGACY_RESERVED_NEURONS, LEGACY_RESERVATION_ID,
  safeId, type RecoveryEnvironment, type ExecutionAttempt,
} from './recovery.ts';

const MAX_REQUEST_BYTES = 2_048;
const MAX_BUDGET_NEURONS = 1_000_000;
const MAX_CONCURRENCY = 100;
const MAX_IN_FLIGHT_REQUESTS = 100;
const MAX_DIAGNOSTIC_RESERVATIONS = 100;
const UNRESOLVED_RESERVATION_STATUSES = ['RESERVED', 'INFERENCE_STARTED', 'UNKNOWN_USAGE'] as const;

type ControllerEnvironment = RecoveryEnvironment & {
  AI_DAILY_ESTIMATED_NEURON_BUDGET?: string;
  AI_MAX_CONCURRENT_INFERENCES?: string;
  AI_BUDGET_ADMIN_TOKEN?: string;
};

type ReservationStatus = 'RESERVED' | 'INFERENCE_STARTED' | 'COMPLETED'
  | 'FAILED_WITH_KNOWN_USAGE' | 'UNKNOWN_USAGE' | 'RECONCILED';

type ReservationRow = {
  request_id: string;
  grant_id: string;
  utc_day: string;
  model: SupportedModel;
  reserved_neurons: number;
  accounted_neurons: number;
  provider_prompt_tokens: number | null;
  provider_completion_tokens: number | null;
  status: ReservationStatus;
  settlement_state: string;
  failure_classification: string | null;
  slot_active: number;
  reconciliation_action: string | null;
  reconciliation_evidence_hash: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parsePositiveInteger(value: string | undefined, maximum: number): number | null {
  if (value === undefined || !/^[1-9]\d*$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed <= maximum ? parsed : null;
}

function utcDay(nowMs: number): string | null {
  if (!Number.isSafeInteger(nowMs) || nowMs < 0) return null;
  const date = new Date(nowMs);
  return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : null;
}

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

function constantTimeEqual(left: string, right: string): boolean {
  const encoder = new TextEncoder();
  const leftBytes = encoder.encode(left);
  const rightBytes = encoder.encode(right);
  let difference = leftBytes.length ^ rightBytes.length;
  const length = Math.max(leftBytes.length, rightBytes.length);
  for (let index = 0; index < length; index++) {
    difference |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }
  return difference === 0;
}

export class AiBudgetController {
  private readonly ctx: DurableObjectState;
  private readonly env: ControllerEnvironment;
  private inFlightRequests = 0;
  private readonly recovery: RecoveryLedger;
  private readonly clock: () => number;
  private transactionDepth = 0;

  private transaction<T>(action: () => T): T {
    if (this.transactionDepth > 0) return action();
    return this.ctx.storage.transactionSync(() => {
      this.transactionDepth++;
      try { return action(); } finally { this.transactionDepth--; }
    });
  }

  constructor(
    ctx: DurableObjectState,
    env: ControllerEnvironment,
    clock: () => number = Date.now,
  ) {
    this.ctx = ctx;
    this.env = env;
    this.clock = clock;
    ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS daily_budgets (
        utc_day TEXT PRIMARY KEY,
        settled_neurons INTEGER NOT NULL DEFAULT 0 CHECK (settled_neurons >= 0),
        reserved_neurons INTEGER NOT NULL DEFAULT 0 CHECK (reserved_neurons >= 0),
        updated_at INTEGER NOT NULL
      )
    `);
    ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS reservations (
        request_id TEXT PRIMARY KEY,
        grant_id TEXT NOT NULL UNIQUE,
        utc_day TEXT NOT NULL,
        model TEXT NOT NULL CHECK (model IN ('@cf/google/gemma-4-26b-a4b-it', '@cf/qwen/qwen3-30b-a3b-fp8')),
        reserved_neurons INTEGER NOT NULL CHECK (reserved_neurons > 0),
        accounted_neurons INTEGER NOT NULL DEFAULT 0 CHECK (accounted_neurons >= 0),
        provider_prompt_tokens INTEGER,
        provider_completion_tokens INTEGER,
        reservation_at INTEGER NOT NULL,
        inference_started_at INTEGER,
        completion_at INTEGER,
        status TEXT NOT NULL CHECK (status IN (
          'RESERVED', 'INFERENCE_STARTED', 'COMPLETED',
          'FAILED_WITH_KNOWN_USAGE', 'UNKNOWN_USAGE', 'RECONCILED'
        )),
        settlement_state TEXT NOT NULL CHECK (settlement_state IN ('RESERVED', 'SETTLED', 'RECONCILED')),
        failure_classification TEXT,
        usage_source TEXT,
        slot_active INTEGER NOT NULL DEFAULT 1 CHECK (slot_active IN (0, 1)),
        reconciliation_action TEXT,
        reconciliation_evidence_hash TEXT,
        reconciled_at INTEGER
      )
    `);
    ctx.storage.sql.exec(`
      CREATE INDEX IF NOT EXISTS reservations_active_slot
      ON reservations (slot_active)
    `);
    this.recovery = new RecoveryLedger(ctx.storage, env);
  }

  async alarm(): Promise<void> {
    try {
      this.transaction(() => this.recovery.sweep(this.clock()));
      await this.recovery.schedule(this.clock());
    } catch (error) {
      // Alarm retries are finite. Persist another wakeup before propagating failure.
      await this.ctx.storage.setAlarm(this.clock() + 10_000);
      throw error;
    }
  }

  async fetch(request: Request): Promise<Response> {
    if (this.inFlightRequests >= MAX_IN_FLIGHT_REQUESTS) {
      return jsonResponse({ error: 'CONTROLLER_OVERLOADED' }, 503);
    }
    this.inFlightRequests++;
    try {
      if (request.method !== 'POST') return jsonResponse({ error: 'METHOD_NOT_ALLOWED' }, 405);
      const path = new URL(request.url).pathname;
      if (path === '/internal/status') return this.status(request);
      if (path === '/internal/legacy-quarantine') {
        const body = await this.readBody(request);
        if (!body) return jsonResponse({ recovered: false, reason: 'invalid_request' }, 400);
        return this.legacyUnknownToQuarantine(request, body);
      }
      const body = await this.readBody(request);
      if (!body) return jsonResponse({ error: 'INVALID_REQUEST' }, 400);

      if (body.protocol === 2 && ['/admit', '/start', '/settle', '/heartbeat'].includes(path)) {
        if (!safeId(body.requestId) || !safeId(body.attemptId) || !safeId(body.ownerId) || !safeId(body.commandId)) {
          return jsonResponse({ error: 'INVALID_IDENTITY' }, 400);
        }
        if ((body.grantId !== undefined && !safeId(body.grantId))
          || (body.failureClassification !== undefined && (typeof body.failureClassification !== 'string'
            || !/^[A-Z_]{1,64}$/.test(body.failureClassification)))
          || (body.generation !== undefined && (!Number.isSafeInteger(body.generation) || Number(body.generation) < 1))) {
          return jsonResponse({ error: 'INVALID_METADATA' }, 400);
        }
        if (path === '/admit' && (!Number.isSafeInteger(body.estimatedNeurons) || Number(body.estimatedNeurons) <= 0
          || Number(body.estimatedNeurons) > MAX_BUDGET_NEURONS || ![GEMMA_MODEL, QWEN_MODEL].includes(body.model as typeof GEMMA_MODEL))) {
          return jsonResponse({ error: 'INVALID_ADMISSION' }, 400);
        }
        if (path === '/admit' && body.ingressRayId !== undefined
          && (typeof body.ingressRayId !== 'string' || !/^[a-fA-F0-9]{16,32}-[A-Z]{3}$/.test(body.ingressRayId))) {
          return jsonResponse({ error: 'INVALID_CORRELATION' }, 400);
        }
        if (path !== '/admit' && (!safeId(body.grantId) || !Number.isSafeInteger(body.generation))) {
          return jsonResponse({ error: 'INVALID_IDENTITY' }, 400);
        }
        if (path === '/settle' && (!['completed', 'failed', 'not_started'].includes(String(body.outcome))
          || typeof body.terminal !== 'boolean' || typeof body.failureClassification !== 'string'
          || (body.usage !== undefined && (!isRecord(body.usage) || !Number.isSafeInteger(body.usage.promptTokens)
            || !Number.isSafeInteger(body.usage.completionTokens))))) {
          return jsonResponse({ error: 'INVALID_SETTLEMENT' }, 400);
        }
        // Only allowlisted lifecycle fields enter receipts; never persist request bodies or credentials.
        const fingerprint = JSON.stringify([path, body.requestId, body.attemptId, body.ownerId,
          ...(path === '/admit' ? [body.estimatedNeurons, body.model, body.ingressRayId] : [body.grantId, body.generation]),
          ...(path === '/settle' ? [body.outcome, body.terminal, body.failureClassification,
            isRecord(body.usage) ? [body.usage.promptTokens, body.usage.completionTokens] : null] : [])]);
        await this.recovery.arm(this.clock());
        const result = this.transaction(() => {
          this.recovery.sweep(this.clock());
          const prior = this.recovery.rows<{ fingerprint: string; result: string }>(
            'SELECT fingerprint, result FROM lifecycle_receipts WHERE command_id = ?', body.commandId as string)[0];
          if (prior) return prior.fingerprint === fingerprint
            ? { ...JSON.parse(prior.result), replayed: true }
            : { reason: 'conflicting_command' };
          const result = path === '/admit' ? this.admit(body) : path === '/start' ? this.start(body)
            : path === '/heartbeat' ? this.heartbeat(body) : this.settle(body);
          this.ctx.storage.sql.exec('INSERT INTO lifecycle_receipts VALUES (?, ?, ?, ?)',
            body.commandId as string, body.requestId as string, fingerprint, JSON.stringify(result));
          return result;
        });
        // If scheduling fails the caller sees an ambiguous result; replay uses its durable receipt.
        await this.recovery.schedule(this.clock());
        return jsonResponse(result, String(result.reason ?? '').startsWith('conflicting_') ? 409 : 200);
      }

      switch (path) {
        case '/admit':
          return jsonResponse(this.admit(body));
        case '/start':
          return jsonResponse(this.start(body));
        case '/settle': {
          const result = this.settle(body);
          return jsonResponse(result, result.reason === 'conflicting_settlement' ? 409 : 200);
        }
        case '/internal/reconcile':
          return this.reconcile(request, body);
        default:
          return jsonResponse({ error: 'NOT_FOUND' }, 404);
      }
    } finally {
      this.inFlightRequests--;
    }
  }

  private async readBody(request: Request): Promise<Record<string, unknown> | null> {
    const length = request.headers.get('Content-Length');
    if (length !== null && (!/^\d+$/.test(length) || Number(length) > MAX_REQUEST_BYTES)) return null;
    try {
      const bytes = await request.arrayBuffer();
      if (bytes.byteLength > MAX_REQUEST_BYTES) return null;
      const value: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes));
      return isRecord(value) ? value : null;
    } catch {
      return null;
    }
  }

  private grant(r: ReservationRow, a: ExecutionAttempt): Record<string, unknown> {
    return { granted: true, requestId: r.request_id, grantId: r.grant_id, utcDay: r.utc_day,
      reservedNeurons: r.reserved_neurons, attemptId: a.attempt_id, ownerId: a.owner_id,
      generation: a.generation, leaseExpiresAt: a.lease_expires_at, deadlineAt: a.deadline_at };
  }

  private reservationByRequest(requestId: string): ReservationRow | undefined {
    return this.rows<ReservationRow>('SELECT * FROM reservations WHERE request_id = ?', requestId)[0];
  }

  private heartbeat(body: Record<string, unknown>): Record<string, unknown> {
    const a = this.recovery.attempt(body.requestId as string);
    const now = this.clock();
    if (!a || !this.recovery.matches(a, body) || a.grant_id !== body.grantId
      || a.recovery_state !== 'OWNED' || a.lease_expires_at <= now || a.deadline_at <= now) {
      return { renewed: false, reason: 'fenced' };
    }
    const expires = Math.min(now + EXECUTION_LEASE_MS, a.deadline_at);
    this.ctx.storage.sql.exec('UPDATE execution_attempts SET lease_expires_at = ? WHERE request_id = ? AND generation = ?',
      expires, a.request_id, a.generation);
    return { renewed: true, leaseExpiresAt: expires, deadlineAt: a.deadline_at };
  }

  private settleAttempt(body: Record<string, unknown>, r: ReservationRow, a: ExecutionAttempt,
    usage: ReportedTokenUsage | null, now: number): Record<string, unknown> {
    const usageUpgrade = body.terminal === true && usage !== null && r.status === 'UNKNOWN_USAGE'
      && r.provider_prompt_tokens === null && r.provider_completion_tokens === null
      && ((a.provider_outcome === 'COMPLETED' && body.outcome === 'completed')
        || (a.provider_outcome === 'FAILED' && body.outcome === 'failed'));
    if (a.provider_outcome !== 'UNKNOWN' && !usageUpgrade) {
      if (body.terminal === false) return { settled: true, duplicate: true, status: r.status };
      const recordedOutcome = a.provider_outcome === 'COMPLETED' ? 'completed' : a.provider_outcome === 'FAILED' ? 'failed' : undefined;
      return this.matchesDuplicateSettlement(r, body.outcome, body.terminal as boolean, body.failureClassification as string, usage, recordedOutcome)
        ? { settled: true, duplicate: true, status: r.status }
        : { settled: false, reason: 'conflicting_settlement' };
    }
    const terminal = body.terminal === true;
    const wasReserved = r.settlement_state === 'RESERVED';
    const reservedBefore = wasReserved ? Number(r.reserved_neurons) : 0;
    const accountedBefore = Number(r.accounted_neurons);
    // Only final evidence can lower a conservative charge. Partial/unknown usage never refunds.
    const measured = usage ? estimateNeuronUsageForModel(r.model, usage.promptTokens, usage.completionTokens) : null;
    const accounted = body.outcome === 'not_started' ? 0
      : terminal && measured !== null ? measured : Math.max(Number(r.reserved_neurons), accountedBefore, measured ?? 0);
    const status: ReservationStatus = body.outcome === 'not_started' ? 'RECONCILED'
      : terminal && measured !== null ? body.outcome === 'completed' ? 'COMPLETED' : 'FAILED_WITH_KNOWN_USAGE' : 'UNKNOWN_USAGE';
    const keepSlot = !terminal && a.recovery_state === 'OWNED';
    if (wasReserved) {
      this.releaseReservation(r, accounted, now, body.failureClassification as string, terminal ? usage : null,
        terminal ? measured !== null ? 'provider_tokens_estimated_neurons' : 'terminal_usage_unknown'
          : 'provisional_unknown_exposure', keepSlot, status);
    } else {
      this.ctx.storage.sql.exec(`UPDATE daily_budgets SET settled_neurons = settled_neurons + ?, updated_at = ? WHERE utc_day = ?`,
        accounted - accountedBefore, now, r.utc_day);
      this.ctx.storage.sql.exec(`UPDATE reservations SET accounted_neurons = ?, provider_prompt_tokens = ?,
        provider_completion_tokens = ?, completion_at = ?, status = ?, settlement_state = ?,
        failure_classification = ?, usage_source = ?, slot_active = ? WHERE request_id = ? AND grant_id = ?`,
      accounted, terminal ? usage?.promptTokens ?? null : null, terminal ? usage?.completionTokens ?? null : null,
      terminal ? now : null, status, status === 'RECONCILED' ? 'RECONCILED' : 'SETTLED',
      body.failureClassification as string, terminal ? measured !== null ? 'provider_tokens_estimated_neurons' : 'terminal_usage_unknown'
        : 'provisional_unknown_exposure', keepSlot ? 1 : 0, r.request_id, r.grant_id);
    }
    this.recovery.accounting(r.request_id, reservedBefore, accountedBefore, terminal ? 'FINAL_EVIDENCE' : 'PROVISIONAL', now);
    if (terminal) {
      const outcome = body.outcome === 'completed' ? 'COMPLETED' : body.outcome === 'not_started' ? 'NOT_STARTED' : 'FAILED';
      this.ctx.storage.sql.exec(`UPDATE execution_attempts SET provider_outcome = ?, recovery_state = 'TERMINAL',
        terminal_at = ?, evidence_ref = ? WHERE request_id = ? AND generation = ?`,
      outcome, now, body.commandId as string, r.request_id, a.generation);
      this.recovery.event(a, 'provider_terminal_observed', now);
      if (body.outcome === 'completed') this.recovery.event(a, 'provider_accepted', now);
    } else if (body.failureClassification === 'INFERENCE_DEADLINE_EXCEEDED') {
      this.recovery.event(a, 'deadline_exceeded', now);
      this.recovery.event(a, 'cancel_requested', now);
    }
    this.recovery.event(a, 'settlement_applied', now, terminal ? 'FINAL' : 'PROVISIONAL');
    return { settled: true, duplicate: false, status };
  }

  private admit(body: Record<string, unknown>): Record<string, unknown> {
    const requestId = body.requestId;
    const estimatedNeurons = body.estimatedNeurons;
    const model = body.model;
    const nowMs = body.protocol === 2 ? this.clock() : body.nowMs === undefined ? Date.now() : body.nowMs;
    if (typeof requestId !== 'string' || requestId.length < 1 || requestId.length > 128
      || typeof estimatedNeurons !== 'number' || !Number.isSafeInteger(estimatedNeurons)
      || estimatedNeurons <= 0 || estimatedNeurons > MAX_BUDGET_NEURONS
      || (model !== GEMMA_MODEL && model !== QWEN_MODEL)
      || typeof nowMs !== 'number') {
      return { granted: false, reason: 'invalid_request' };
    }
    const day = utcDay(nowMs);
    const budget = parsePositiveInteger(this.env.AI_DAILY_ESTIMATED_NEURON_BUDGET, MAX_BUDGET_NEURONS);
    const concurrency = parsePositiveInteger(this.env.AI_MAX_CONCURRENT_INFERENCES, MAX_CONCURRENCY);
    if (!day || !budget || !concurrency) return { granted: false, reason: 'invalid_configuration' };

    return this.transaction(() => {
      const existing = this.reservationByRequest(requestId);
      if (existing) {
        const a = this.recovery.attempt(requestId);
        if (body.protocol === 2 && a && a.attempt_id === body.attemptId && a.owner_id === body.ownerId
          && Number(existing.reserved_neurons) === estimatedNeurons && existing.model === model) {
          return this.grant(existing, a);
        }
        return { granted: false, reason: 'duplicate_request' };
      }

      const policy = this.recovery.policy();
      const exposure = this.recovery.exposure();
      // Old protocol callers cannot bypass exposure held by newer deployments.
      if (body.protocol !== 2 && Number(exposure.count) > 0) return { granted: false, reason: 'busy' };
      if (policy.strict && this.recovery.rows<{ count: number }>(`SELECT COUNT(*) AS count
        FROM execution_attempts WHERE provider_outcome = 'UNKNOWN' AND recovery_state = 'QUARANTINED'`)[0].count > 0) {
        return { granted: false, reason: 'busy' };
      }
      if (policy.strict && this.recovery.legacyUnknown() > 0) return { granted: false, reason: 'busy' };

      if (body.protocol === 2) {
        // Legacy active work cannot be fenced or automatically made safe by this protocol.
        if (this.recovery.legacyActive() > 0) return { granted: false, reason: 'busy' };
        if (policy.mode === 'bounded' && (Number(exposure.count) + 1 > policy.attempts!
          || Number(exposure.neurons) + estimatedNeurons > policy.neurons!)) {
          return { granted: false, reason: 'uncertainty_limit' };
        }
      }

      this.ctx.storage.sql.exec(
        'INSERT OR IGNORE INTO daily_budgets (utc_day, updated_at) VALUES (?, ?)',
        day,
        nowMs,
      );
      const daily = this.rows<{ settled_neurons: number; reserved_neurons: number }>(
        'SELECT settled_neurons, reserved_neurons FROM daily_budgets WHERE utc_day = ?',
        day,
      )[0];
      const active = this.rows<{ count: number }>(
        'SELECT COUNT(*) AS count FROM reservations WHERE slot_active = 1',
      )[0];
      if (!daily || !active) return { granted: false, reason: 'storage_unavailable' };
      if (Number(active.count) >= concurrency) return { granted: false, reason: 'busy' };
      const carryExposure = body.protocol === 2 ? Number(this.recovery.exposure(day).neurons) : 0;
      if (Number(daily.settled_neurons) + Number(daily.reserved_neurons) + carryExposure + estimatedNeurons > budget) {
        return { granted: false, reason: 'budget_exhausted' };
      }

      const grantId = crypto.randomUUID();
      this.ctx.storage.sql.exec(
        `INSERT INTO reservations (
          request_id, grant_id, utc_day, model, reserved_neurons, reservation_at,
          status, settlement_state, failure_classification, usage_source, slot_active
        ) VALUES (?, ?, ?, ?, ?, ?, 'RESERVED', 'RESERVED', NULL, NULL, 1)`,
        requestId,
        grantId,
        day,
        model,
        estimatedNeurons,
        nowMs,
      );
      this.ctx.storage.sql.exec(
        'UPDATE daily_budgets SET reserved_neurons = reserved_neurons + ?, updated_at = ? WHERE utc_day = ?',
        estimatedNeurons,
        nowMs,
        day,
      );
      if (body.protocol === 2) {
        const a = this.recovery.create(requestId, grantId, body.attemptId as string, body.ownerId as string, nowMs as number,
          typeof body.ingressRayId === 'string' ? body.ingressRayId : null);
        this.recovery.accounting(requestId, 0, 0, 'ADMISSION', nowMs as number);
        return this.grant(this.reservation(requestId, grantId)!, a);
      }
      return { granted: true, requestId, grantId, utcDay: day, reservedNeurons: estimatedNeurons };
    });
  }

  private start(body: Record<string, unknown>): Record<string, unknown> {
    const identity = this.identity(body);
    if (!identity) return { started: false, reason: 'invalid_request' };
    const nowMs = body.protocol === 2 ? this.clock() : body.nowMs === undefined ? Date.now() : body.nowMs;
    if (typeof nowMs !== 'number' || !Number.isSafeInteger(nowMs) || nowMs < 0) {
      return { started: false, reason: 'invalid_request' };
    }
    return this.transaction(() => {
      const reservation = this.reservation(identity.requestId, identity.grantId);
      if (!reservation || reservation.status === 'RECONCILED') return { started: false, reason: 'unknown_grant' };
      const a = this.recovery.attempt(identity.requestId);
      if (a) {
        if (body.protocol !== 2 || !this.recovery.matches(a, body)) return { started: false, reason: 'fenced' };
        const policy = this.recovery.policy();
        const exposure = this.recovery.exposure();
        const retired = this.recovery.rows<{ count: number }>(`SELECT COUNT(*) AS count FROM execution_attempts
          WHERE provider_outcome = 'UNKNOWN' AND recovery_state = 'QUARANTINED'`)[0].count;
        if ((policy.strict && (Number(retired) > 0 || this.recovery.legacyUnknown() > 0)) || (policy.mode === 'bounded'
          && (Number(exposure.count) > policy.attempts! || Number(exposure.neurons) > policy.neurons!))) {
          return { started: false, reason: 'uncertainty_limit' };
        }
        if (a.recovery_state !== 'OWNED' || a.lease_expires_at <= nowMs || a.deadline_at <= nowMs) {
          return { started: false, reason: 'expired' };
        }
        if (reservation.status !== 'RESERVED') return { started: false, reason: 'already_dispatched' };
        this.recovery.event(a, 'dispatch_intent', nowMs);
      } else if (body.protocol === 2) return { started: false, reason: 'legacy_protected' };
      if (reservation.status === 'INFERENCE_STARTED') return { started: true, duplicate: true };
      if (reservation.status !== 'RESERVED') return { started: false, reason: 'already_settled' };
      this.ctx.storage.sql.exec(
        `UPDATE reservations SET status = 'INFERENCE_STARTED', inference_started_at = ?
         WHERE request_id = ? AND grant_id = ? AND status = 'RESERVED'`,
        nowMs,
        identity.requestId,
        identity.grantId,
      );
      return { started: true, ...(a ? { leaseExpiresAt: a.lease_expires_at, deadlineAt: a.deadline_at } : {}) };
    });
  }

  private settle(body: Record<string, unknown>): Record<string, unknown> {
    const identity = this.identity(body);
    const outcome = body.outcome;
    const terminal = body.terminal;
    const failureClassification = body.failureClassification;
    const nowMs = body.protocol === 2 ? this.clock() : body.nowMs === undefined ? Date.now() : body.nowMs;
    const suppliedUsage = body.usage !== undefined;
    if (!identity || !['completed', 'failed', 'not_started'].includes(String(outcome))
      || typeof terminal !== 'boolean' || typeof failureClassification !== 'string'
      || failureClassification.length > 64 || typeof nowMs !== 'number'
      || !Number.isSafeInteger(nowMs) || nowMs < 0
      || (outcome === 'completed' && !terminal)
      || (outcome === 'not_started' && (terminal !== true || suppliedUsage))) {
      return { settled: false, reason: 'invalid_request' };
    }

    return this.transaction(() => {
      const reservation = this.reservation(identity.requestId, identity.grantId);
      if (!reservation) return { settled: false, reason: 'unknown_grant' };
      const usage = suppliedUsage ? this.usage(body.usage, reservation.model) : null;
      if (suppliedUsage && !usage) return { settled: false, reason: 'invalid_usage' };
      const a = this.recovery.attempt(identity.requestId);
      if (a) {
        if (body.protocol !== 2 || !this.recovery.matches(a, body)) return { settled: false, reason: 'fenced' };
        return this.settleAttempt(body, reservation, a, usage, nowMs as number);
      }
      if (body.protocol === 2) return { settled: false, reason: 'legacy_protected' };
      const legacyExposure = this.recovery.rows<{
        provider_outcome: string;
        failure_classification: string | null;
        provider_prompt_tokens: number | null;
        provider_completion_tokens: number | null;
      }>('SELECT provider_outcome, failure_classification, provider_prompt_tokens, provider_completion_tokens FROM legacy_exposures WHERE request_id = ?',
      identity.requestId)[0];
      if (legacyExposure) return this.settleLegacyExposure(body, reservation, legacyExposure, usage, nowMs as number);
      if (reservation.settlement_state !== 'RESERVED') {
        if (this.matchesDuplicateSettlement(reservation, outcome, terminal, failureClassification, usage)) {
          return { settled: true, duplicate: true, status: reservation.status };
        }
        return { settled: false, reason: 'conflicting_settlement' };
      }
      if (!['RESERVED', 'INFERENCE_STARTED'].includes(reservation.status)) {
        return { settled: false, reason: 'invalid_state' };
      }

      if (outcome === 'not_started') {
        this.releaseReservation(reservation, 0, nowMs, 'INFERENCE_NOT_DISPATCHED', null, null, false);
        return { settled: true, duplicate: false, status: 'RECONCILED' };
      }

      const usageNeurons = usage
        ? estimateNeuronUsageForModel(reservation.model, usage.promptTokens, usage.completionTokens)
        : null;
      const hasKnownUsage = usageNeurons !== null;
      const accountedNeurons = hasKnownUsage ? usageNeurons : Number(reservation.reserved_neurons);
      const status: ReservationStatus = hasKnownUsage
        ? outcome === 'completed' ? 'COMPLETED' : 'FAILED_WITH_KNOWN_USAGE'
        : 'UNKNOWN_USAGE';
      this.releaseReservation(
        reservation,
        accountedNeurons,
        nowMs,
        failureClassification,
        usage,
        hasKnownUsage ? 'provider_tokens_estimated_neurons' : 'reserved_estimate_unknown_usage',
        !terminal,
        status,
      );
      return { settled: true, duplicate: false, status };
    });
  }

  private settleLegacyExposure(
    body: Record<string, unknown>,
    reservation: ReservationRow,
    exposure: {
      provider_outcome: string;
      failure_classification: string | null;
      provider_prompt_tokens: number | null;
      provider_completion_tokens: number | null;
    },
    usage: ReportedTokenUsage | null,
    nowMs: number,
  ): Record<string, unknown> {
    const outcome = body.outcome as string;
    const failureClassification = body.failureClassification as string;
    if (exposure.provider_outcome !== 'UNKNOWN') {
      const expectedOutcome = exposure.provider_outcome === 'COMPLETED' ? 'completed' : 'failed';
      return body.terminal === true && outcome === expectedOutcome
        && failureClassification === exposure.failure_classification
        && (usage?.promptTokens ?? null) === exposure.provider_prompt_tokens
        && (usage?.completionTokens ?? null) === exposure.provider_completion_tokens
        ? { settled: true, duplicate: true, status: reservation.status }
        : { settled: false, reason: 'conflicting_settlement' };
    }
    if (body.terminal !== true || (outcome !== 'completed' && outcome !== 'failed')
      || reservation.status !== 'UNKNOWN_USAGE' || reservation.settlement_state !== 'SETTLED'
      || reservation.slot_active !== 0) {
      return { settled: false, reason: 'conflicting_settlement' };
    }

    const measured = usage ? estimateNeuronUsageForModel(reservation.model, usage.promptTokens, usage.completionTokens) : null;
    const accountedNeurons = Math.max(Number(reservation.accounted_neurons), measured ?? 0);
    const status: ReservationStatus = measured === null ? 'UNKNOWN_USAGE'
      : outcome === 'completed' ? 'COMPLETED' : 'FAILED_WITH_KNOWN_USAGE';
    const providerOutcome = outcome === 'completed' ? 'COMPLETED' : 'FAILED';
    const usageSource = measured === null ? 'provisional_legacy_unknown_exposure'
      : 'provider_tokens_estimated_neurons_with_provisional_floor';
    this.ctx.storage.sql.exec(`UPDATE daily_budgets SET settled_neurons = settled_neurons + ?, updated_at = ?
      WHERE utc_day = ?`, accountedNeurons - Number(reservation.accounted_neurons), nowMs, reservation.utc_day);
    this.ctx.storage.sql.exec(`UPDATE reservations SET accounted_neurons = ?, provider_prompt_tokens = ?,
      provider_completion_tokens = ?, completion_at = ?, status = ?, failure_classification = ?, usage_source = ?
      WHERE request_id = ? AND grant_id = ? AND slot_active = 0 AND settlement_state = 'SETTLED'`,
    accountedNeurons, usage?.promptTokens ?? null, usage?.completionTokens ?? null, nowMs, status,
    failureClassification, usageSource, reservation.request_id, reservation.grant_id);
    this.ctx.storage.sql.exec(`UPDATE legacy_exposures SET provider_outcome = ?, recovery_state = 'TERMINAL',
      terminal_at = ?, failure_classification = ?, provider_prompt_tokens = ?, provider_completion_tokens = ?
      WHERE request_id = ? AND provider_outcome = 'UNKNOWN'`,
    providerOutcome, nowMs, failureClassification, usage?.promptTokens ?? null, usage?.completionTokens ?? null,
    reservation.request_id);
    this.recovery.accounting(reservation.request_id, 0, Number(reservation.accounted_neurons), 'LEGACY_FINAL_EVIDENCE', nowMs);
    return { settled: true, duplicate: false, status };
  }

  private legacyUnknownToQuarantine(request: Request, body: Record<string, unknown>): Response {
    if (!this.isAuthorized(request)) {
      return jsonResponse({ recovered: false, reason: 'unauthorized' }, 403);
    }
    const keys = Object.keys(body).sort();
    if (keys.join(',') !== 'expectedReservedNeurons,expectedStatus,transition'
      || body.transition !== 'legacy_unknown_to_quarantine'
      || body.expectedReservedNeurons !== LEGACY_RESERVED_NEURONS
      || (body.expectedStatus !== 'RESERVED' && body.expectedStatus !== 'INFERENCE_STARTED')) {
      return jsonResponse({ recovered: false, reason: 'invalid_request' }, 400);
    }

    const expectedStatus = body.expectedStatus;
    const now = this.clock();
    const result = this.transaction(() => {
      const prior = this.recovery.rows<{
        expected_status: string;
        provisional_neurons: number;
        recovery_state: string;
        provider_outcome: string;
      }>('SELECT expected_status, provisional_neurons, recovery_state, provider_outcome FROM legacy_exposures WHERE request_id = ?',
      LEGACY_RESERVATION_ID)[0];
      if (prior) {
        return prior.expected_status === expectedStatus
          && Number(prior.provisional_neurons) === LEGACY_RESERVED_NEURONS
          && prior.recovery_state === 'QUARANTINED' && prior.provider_outcome === 'UNKNOWN'
          ? { recovered: true, duplicate: true, requestId: LEGACY_RESERVATION_ID,
            provisionalNeurons: LEGACY_RESERVED_NEURONS, providerOutcome: 'UNKNOWN' }
          : { recovered: false, reason: 'conflicting_transition' };
      }

      const reservation = this.reservationByRequest(LEGACY_RESERVATION_ID);
      if (!reservation) return { recovered: false, reason: 'legacy_reservation_missing' };
      if (reservation.status !== expectedStatus || reservation.settlement_state !== 'RESERVED'
        || Number(reservation.reserved_neurons) !== LEGACY_RESERVED_NEURONS
        || Number(reservation.accounted_neurons) !== 0 || reservation.slot_active !== 1) {
        return { recovered: false, reason: 'legacy_state_mismatch' };
      }

      const policy = this.recovery.policy();
      const budget = parsePositiveInteger(this.env.AI_DAILY_ESTIMATED_NEURON_BUDGET, MAX_BUDGET_NEURONS);
      const concurrency = parsePositiveInteger(this.env.AI_MAX_CONCURRENT_INFERENCES, MAX_CONCURRENCY);
      const configuredBudgets = this.rows<{ count: number }>(`SELECT COUNT(*) AS count FROM daily_budgets b
        WHERE b.settled_neurons != (SELECT COALESCE(SUM(r.accounted_neurons), 0) FROM reservations r WHERE r.utc_day = b.utc_day)
          OR b.reserved_neurons != (SELECT COALESCE(SUM(CASE WHEN r.settlement_state = 'RESERVED'
            THEN r.reserved_neurons ELSE 0 END), 0) FROM reservations r WHERE r.utc_day = b.utc_day)`)[0].count;
      const orphanedReservations = this.rows<{ count: number }>(`SELECT COUNT(*) AS count FROM reservations r
        LEFT JOIN daily_budgets b ON b.utc_day = r.utc_day WHERE b.utc_day IS NULL`)[0].count;
      if (Number(configuredBudgets) !== 0 || Number(orphanedReservations) !== 0) {
        return { recovered: false, reason: 'accounting_invariant_failed' };
      }
      if (policy.mode !== 'observe' || !policy.alarmsAvailable || policy.attempts !== 2 || policy.neurons !== 2_000
        || budget !== 2_000 || concurrency !== 1) {
        return { recovered: false, reason: 'safety_configuration_invalid' };
      }

      const exposure = this.recovery.exposure();
      if (Number(exposure.count) + 1 > policy.attempts || Number(exposure.neurons) + LEGACY_RESERVED_NEURONS > policy.neurons) {
        return { recovered: false, reason: 'exposure_capacity_exhausted' };
      }
      const active = this.rows<{ count: number }>('SELECT COUNT(*) AS count FROM reservations WHERE slot_active = 1')[0].count;
      if (Number(active) !== 1 || this.recovery.legacyActive() !== 1) {
        return { recovered: false, reason: 'slot_ownership_conflict' };
      }

      const day = utcDay(now);
      if (!day) return { recovered: false, reason: 'invalid_clock' };
      const daily = this.rows<{ settled_neurons: number; reserved_neurons: number }>(
        'SELECT settled_neurons, reserved_neurons FROM daily_budgets WHERE utc_day = ?', day)[0];
      const carryExposure = Number(this.recovery.exposure(day).neurons)
        + (reservation.utc_day !== day ? LEGACY_RESERVED_NEURONS : 0);
      if (Number(daily?.settled_neurons ?? 0) + Number(daily?.reserved_neurons ?? 0) + carryExposure > budget) {
        return { recovered: false, reason: 'budget_exhausted' };
      }

      this.ctx.storage.sql.exec(`UPDATE daily_budgets SET reserved_neurons = reserved_neurons - ?,
        settled_neurons = settled_neurons + ?, updated_at = ?
        WHERE utc_day = ? AND reserved_neurons >= ?`,
      LEGACY_RESERVED_NEURONS, LEGACY_RESERVED_NEURONS, now, reservation.utc_day, LEGACY_RESERVED_NEURONS);
      this.ctx.storage.sql.exec(`UPDATE reservations SET accounted_neurons = ?, settlement_state = 'SETTLED',
        status = 'UNKNOWN_USAGE', failure_classification = 'LEGACY_UNKNOWN_QUARANTINED',
        usage_source = 'provisional_legacy_unknown_exposure', slot_active = 0
        WHERE request_id = ? AND grant_id = ? AND status = ? AND settlement_state = 'RESERVED'
          AND reserved_neurons = ? AND accounted_neurons = 0 AND slot_active = 1`,
      LEGACY_RESERVED_NEURONS, LEGACY_RESERVATION_ID, reservation.grant_id, expectedStatus, LEGACY_RESERVED_NEURONS);
      this.ctx.storage.sql.exec(`INSERT INTO legacy_exposures
        (request_id, expected_status, provisional_neurons, provider_outcome, recovery_state, quarantined_at)
        VALUES (?, ?, ?, 'UNKNOWN', 'QUARANTINED', ?)`,
      LEGACY_RESERVATION_ID, expectedStatus, LEGACY_RESERVED_NEURONS, now);
      const updated = this.reservationByRequest(LEGACY_RESERVATION_ID);
      if (!updated || updated.status !== 'UNKNOWN_USAGE' || updated.settlement_state !== 'SETTLED'
        || Number(updated.accounted_neurons) !== LEGACY_RESERVED_NEURONS || updated.slot_active !== 0) {
        throw new Error('Legacy quarantine did not persist the expected reservation state.');
      }
      this.recovery.accounting(LEGACY_RESERVATION_ID, LEGACY_RESERVED_NEURONS, 0, 'LEGACY_UNKNOWN_TO_QUARANTINE', now);
      return { recovered: true, duplicate: false, requestId: LEGACY_RESERVATION_ID,
        provisionalNeurons: LEGACY_RESERVED_NEURONS, providerOutcome: 'UNKNOWN' };
    });
    const status = result.reason === 'unauthorized' ? 403
      : result.reason === 'invalid_request' ? 400
        : result.reason === 'conflicting_transition' ? 409
          : result.recovered === false ? 409 : 200;
    return jsonResponse(result, status);
  }

  private async reconcile(request: Request, body: Record<string, unknown>): Promise<Response> {
    if (!this.isAuthorized(request)) {
      return jsonResponse({ reconciled: false, reason: 'unauthorized' }, 403);
    }

    const identity = this.identity(body);
    const action = body.action;
    const evidence = body.evidence;
    const nowMs = body.nowMs === undefined ? Date.now() : body.nowMs;
    if (!identity || !['confirm_usage', 'confirm_terminated_unknown', 'confirm_not_started'].includes(String(action))
      || typeof evidence !== 'string' || evidence.trim().length < 1 || evidence.length > 512
      || typeof nowMs !== 'number' || !Number.isSafeInteger(nowMs) || nowMs < 0
      || (action !== 'confirm_usage' && body.usage !== undefined)) {
      return jsonResponse({ reconciled: false, reason: 'invalid_request' }, 400);
    }

    const evidenceHash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(evidence));
    const evidenceDigest = Array.from(new Uint8Array(evidenceHash), byte => byte.toString(16).padStart(2, '0')).join('');
    const result = this.transaction(() => {
      const reservation = this.reservation(identity.requestId, identity.grantId);
      if (!reservation) return { reconciled: false, reason: 'unknown_grant' };
      const usage = body.usage === undefined ? null : this.usage(body.usage, reservation.model);
      if (action === 'confirm_usage' && !usage) return { reconciled: false, reason: 'invalid_usage' };

      let accountedNeurons: number;
      let usageSource: string;
      let actionCode: string;
      if (action === 'confirm_usage' && usage) {
        const estimate = estimateNeuronUsageForModel(reservation.model, usage.promptTokens, usage.completionTokens);
        if (estimate === null) return { reconciled: false, reason: 'invalid_usage' };
        accountedNeurons = estimate;
        usageSource = 'operator_verified_provider_tokens_estimated_neurons';
        actionCode = 'CONFIRMED_USAGE';
      } else if (action === 'confirm_not_started') {
        accountedNeurons = 0;
        usageSource = 'operator_verified_not_started';
        actionCode = 'CONFIRMED_NOT_STARTED';
      } else {
        accountedNeurons = Number(reservation.reserved_neurons);
        usageSource = 'operator_confirmed_terminated_unknown_usage';
        actionCode = 'CONFIRMED_TERMINATED_UNKNOWN';
      }

      if (reservation.status === 'RECONCILED') {
        const matches = reservation.settlement_state === 'RECONCILED'
          && reservation.reconciliation_action === actionCode
          && reservation.reconciliation_evidence_hash === evidenceDigest
          && Number(reservation.accounted_neurons) === accountedNeurons
          && this.matchesUsage(reservation, usage);
        return matches
          ? { reconciled: true, duplicate: true }
          : { reconciled: false, reason: 'conflicting_reconciliation' };
      }
      if (!['RESERVED', 'INFERENCE_STARTED', 'UNKNOWN_USAGE'].includes(reservation.status)) {
        return { reconciled: false, reason: 'not_reconcilable' };
      }

      this.reconcileReservation(
        reservation,
        accountedNeurons,
        nowMs,
        actionCode,
        usageSource,
        evidenceDigest,
        action === 'confirm_usage' && usage ? usage : null,
      );
      const a = this.recovery.attempt(reservation.request_id);
      if (a) {
        this.ctx.storage.sql.exec(`UPDATE execution_attempts SET provider_outcome = ?, recovery_state = 'TERMINAL',
          terminal_at = ?, evidence_ref = ? WHERE request_id = ? AND generation = ?`,
        actionCode, nowMs, evidenceDigest, a.request_id, a.generation);
        this.recovery.accounting(a.request_id, reservation.settlement_state === 'RESERVED' ? Number(reservation.reserved_neurons) : 0,
          Number(reservation.accounted_neurons), 'OPERATOR_EVIDENCE', nowMs as number);
        this.recovery.event(a, 'recovery_applied', nowMs as number);
      }
      return { reconciled: true, duplicate: false };
    });
    return jsonResponse(result, result.reason === 'conflicting_reconciliation' ? 409 : 200);
  }

  private async status(request: Request): Promise<Response> {
    if (!this.isAuthorized(request)) return jsonResponse({ error: 'UNAUTHORIZED' }, 403);

    const body = await this.readBody(request);
    if (!body || Object.keys(body).length !== 0) {
      return jsonResponse({ error: 'INVALID_REQUEST' }, 400);
    }

    const day = utcDay(this.clock());
    if (!day) return jsonResponse({ error: 'STATUS_UNAVAILABLE' }, 503);

    const daily = this.rows<{ settled_neurons: number; reserved_neurons: number }>(
      'SELECT settled_neurons, reserved_neurons FROM daily_budgets WHERE utc_day = ?',
      day,
    )[0];
    const activeSlots = this.rows<{ count: number }>(
      'SELECT COUNT(*) AS count FROM reservations WHERE slot_active = 1',
    )[0];
    const legacyReservation = this.rows<{
      request_id: string;
      grant_id: string;
      utc_day: string;
      status: ReservationStatus;
      settlement_state: string;
      reserved_neurons: number;
      accounted_neurons: number;
      slot_active: number;
      usage_source: string | null;
    }>(`SELECT request_id, grant_id, utc_day, status, settlement_state, reserved_neurons, accounted_neurons,
        slot_active, usage_source FROM reservations WHERE request_id = ?`, LEGACY_RESERVATION_ID)[0];
    const legacyExposure = this.recovery.rows<{
      request_id: string;
      provisional_neurons: number;
      provider_outcome: string;
      recovery_state: string;
      quarantined_at: number;
      terminal_at: number | null;
    }>(`SELECT request_id, provisional_neurons, provider_outcome, recovery_state, quarantined_at, terminal_at
      FROM legacy_exposures WHERE request_id = ?`, LEGACY_RESERVATION_ID)[0];
    const reservationStates: Record<ReservationStatus, number> = {
      RESERVED: 0,
      INFERENCE_STARTED: 0,
      COMPLETED: 0,
      FAILED_WITH_KNOWN_USAGE: 0,
      UNKNOWN_USAGE: 0,
      RECONCILED: 0,
    };
    for (const row of this.rows<{ status: ReservationStatus; count: number }>(
      'SELECT status, COUNT(*) AS count FROM reservations GROUP BY status',
    )) {
      reservationStates[row.status] = Number(row.count);
    }
    const unresolvedReservationCount = UNRESOLVED_RESERVATION_STATUSES
      .reduce((count, status) => count + reservationStates[status], 0);
    const reservationRows = this.rows<{
      request_id: string;
      grant_id: string;
      utc_day: string;
      reserved_neurons: number;
      accounted_neurons: number;
      reservation_at: number;
      inference_started_at: number | null;
      completion_at: number | null;
      status: ReservationStatus;
    }>(
      `SELECT request_id, grant_id, utc_day, reserved_neurons, accounted_neurons,
        reservation_at, inference_started_at, completion_at, status
       FROM reservations
       WHERE status IN (?, ?, ?)
       ORDER BY reservation_at ASC, request_id ASC
       LIMIT ?`,
      ...UNRESOLVED_RESERVATION_STATUSES,
      MAX_DIAGNOSTIC_RESERVATIONS + 1,
    );
    const unresolvedReservations = reservationRows
      .slice(0, MAX_DIAGNOSTIC_RESERVATIONS)
      .map(row => ({
        requestId: row.request_id,
        grantId: row.grant_id,
        utcDay: row.utc_day,
        state: row.status,
        reservedNeurons: Number(row.reserved_neurons),
        accountedNeurons: Number(row.accounted_neurons),
        reservationAt: Number(row.reservation_at),
        inferenceStartedAt: row.inference_started_at === null ? null : Number(row.inference_started_at),
        completionAt: row.completion_at === null ? null : Number(row.completion_at),
      }));

    return jsonResponse({
      status: 'ok',
      budgetDay: day,
      activeInferenceSlots: Number(activeSlots?.count ?? 0),
      configuredConcurrencyLimit: parsePositiveInteger(this.env.AI_MAX_CONCURRENT_INFERENCES, MAX_CONCURRENCY),
      configuredDailyEstimatedNeuronBudget: parsePositiveInteger(this.env.AI_DAILY_ESTIMATED_NEURON_BUDGET, MAX_BUDGET_NEURONS),
      legacyReservation: legacyReservation ? {
        requestId: legacyReservation.request_id,
        grantId: legacyReservation.grant_id,
        utcDay: legacyReservation.utc_day,
        status: legacyReservation.status,
        settlementState: legacyReservation.settlement_state,
        reservedNeurons: Number(legacyReservation.reserved_neurons),
        accountedNeurons: Number(legacyReservation.accounted_neurons),
        slotActive: Number(legacyReservation.slot_active),
        usageSource: legacyReservation.usage_source,
      } : null,
      unresolvedReservationCount,
      reservationStates,
      unresolvedReservations,
      unresolvedReservationDetailsTruncated: unresolvedReservationCount > unresolvedReservations.length,
      recovery: { ...this.recovery.policy(), exposure: this.recovery.exposure(), legacyActiveSlots: this.recovery.legacyActive(),
        legacyUnknownExposures: this.recovery.legacyUnknown(),
        legacyExposure: legacyExposure ? {
          requestId: legacyExposure.request_id,
          provisionalNeurons: Number(legacyExposure.provisional_neurons),
          providerOutcome: legacyExposure.provider_outcome,
          recoveryState: legacyExposure.recovery_state,
          quarantinedAt: Number(legacyExposure.quarantined_at),
          terminalAt: legacyExposure.terminal_at === null ? null : Number(legacyExposure.terminal_at),
        } : null,
        attempts: this.recovery.rows(`SELECT request_id, attempt_id, owner_id, generation, ingress_ray_id, provider_request_id, lease_expires_at,
          deadline_at, provider_outcome, recovery_state, evidence_ref FROM execution_attempts
          WHERE provider_outcome = 'UNKNOWN' ORDER BY admitted_at LIMIT ?`, MAX_DIAGNOSTIC_RESERVATIONS) },
      estimatedSettledNeurons: Number(daily?.settled_neurons ?? 0),
      estimatedReservedNeurons: Number(daily?.reserved_neurons ?? 0),
    });
  }

  private isAuthorized(request: Request): boolean {
    const configuredToken = this.env.AI_BUDGET_ADMIN_TOKEN;
    const authorization = request.headers.get('Authorization') ?? '';
    const suppliedToken = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
    return Boolean(configuredToken && suppliedToken && constantTimeEqual(configuredToken, suppliedToken));
  }

  private matchesDuplicateSettlement(
    reservation: ReservationRow,
    outcome: unknown,
    terminal: boolean,
    failureClassification: string,
    usage: ReportedTokenUsage | null,
    recordedOutcome?: string,
  ): boolean {
    if (reservation.status === 'RECONCILED') {
      return reservation.settlement_state === 'RECONCILED'
        && reservation.failure_classification === 'INFERENCE_NOT_DISPATCHED'
        && outcome === 'not_started'
        && terminal
        && failureClassification === 'INFERENCE_NOT_DISPATCHED'
        && usage === null;
    }

    const expectedOutcome = recordedOutcome ?? (reservation.status === 'COMPLETED'
      ? 'completed'
      : reservation.status === 'UNKNOWN_USAGE' && reservation.failure_classification === 'COMPLETED_USAGE_UNKNOWN'
        ? 'completed'
      : ['FAILED_WITH_KNOWN_USAGE', 'UNKNOWN_USAGE'].includes(reservation.status)
        ? 'failed'
        : null);
    return reservation.settlement_state === 'SETTLED'
      && outcome === expectedOutcome
      && terminal === (reservation.slot_active === 0)
      && reservation.failure_classification === failureClassification
      && this.matchesUsage(reservation, usage);
  }

  private matchesUsage(reservation: ReservationRow, usage: ReportedTokenUsage | null): boolean {
    return reservation.provider_prompt_tokens === (usage?.promptTokens ?? null)
      && reservation.provider_completion_tokens === (usage?.completionTokens ?? null);
  }

  private reconcileReservation(
    reservation: ReservationRow,
    accountedNeurons: number,
    nowMs: number,
    action: string,
    usageSource: string,
    evidenceHash: string,
    usage: ReportedTokenUsage | null,
  ): void {
    const wasReserved = reservation.settlement_state === 'RESERVED';
    const existingAccounted = Number(reservation.accounted_neurons);
    if (wasReserved) {
      this.ctx.storage.sql.exec(
        `UPDATE daily_budgets
         SET reserved_neurons = reserved_neurons - ?, settled_neurons = settled_neurons + ?, updated_at = ?
         WHERE utc_day = ?`,
        reservation.reserved_neurons,
        accountedNeurons,
        nowMs,
        reservation.utc_day,
      );
    } else {
      this.ctx.storage.sql.exec(
        `UPDATE daily_budgets
         SET settled_neurons = settled_neurons - ? + ?, updated_at = ?
         WHERE utc_day = ?`,
        existingAccounted,
        accountedNeurons,
        nowMs,
        reservation.utc_day,
      );
    }
    this.ctx.storage.sql.exec(
      `UPDATE reservations SET
        accounted_neurons = ?, provider_prompt_tokens = ?, provider_completion_tokens = ?,
        completion_at = ?, status = 'RECONCILED', settlement_state = 'RECONCILED',
        failure_classification = ?, usage_source = ?, slot_active = 0,
        reconciliation_action = ?, reconciliation_evidence_hash = ?, reconciled_at = ?
       WHERE request_id = ? AND grant_id = ?`,
      accountedNeurons,
      usage?.promptTokens ?? null,
      usage?.completionTokens ?? null,
      nowMs,
      action,
      usageSource,
      action,
      evidenceHash,
      nowMs,
      reservation.request_id,
      reservation.grant_id,
    );
  }

  private releaseReservation(
    reservation: ReservationRow,
    accountedNeurons: number,
    nowMs: number,
    failureClassification: string,
    usage: ReportedTokenUsage | null,
    usageSource: string | null,
    keepSlotActive: boolean,
    status: ReservationStatus = 'RECONCILED',
  ): void {
    this.ctx.storage.sql.exec(
      `UPDATE daily_budgets
       SET reserved_neurons = reserved_neurons - ?, settled_neurons = settled_neurons + ?, updated_at = ?
       WHERE utc_day = ?`,
      reservation.reserved_neurons,
      accountedNeurons,
      nowMs,
      reservation.utc_day,
    );
    this.ctx.storage.sql.exec(
      `UPDATE reservations SET
        accounted_neurons = ?, provider_prompt_tokens = ?, provider_completion_tokens = ?,
        completion_at = ?, status = ?, settlement_state = ?,
        failure_classification = ?, usage_source = ?, slot_active = ?
       WHERE request_id = ? AND grant_id = ?`,
      accountedNeurons,
      usage?.promptTokens ?? null,
      usage?.completionTokens ?? null,
      keepSlotActive ? null : nowMs,
      status,
      status === 'RECONCILED' ? 'RECONCILED' : 'SETTLED',
      failureClassification,
      usageSource,
      keepSlotActive ? 1 : 0,
      reservation.request_id,
      reservation.grant_id,
    );
  }

  private identity(body: Record<string, unknown>): { requestId: string; grantId: string } | null {
    return typeof body.requestId === 'string' && body.requestId.length > 0 && body.requestId.length <= 128
      && typeof body.grantId === 'string' && body.grantId.length > 0 && body.grantId.length <= 128
      ? { requestId: body.requestId, grantId: body.grantId }
      : null;
  }

  private usage(value: unknown, model: SupportedModel): ReportedTokenUsage | null {
    if (!isRecord(value)
      || typeof value.promptTokens !== 'number' || !Number.isSafeInteger(value.promptTokens)
      || value.promptTokens < 1
      || typeof value.completionTokens !== 'number' || !Number.isSafeInteger(value.completionTokens)
      || value.completionTokens < 0
      || estimateNeuronUsageForModel(model, value.promptTokens, value.completionTokens) === null) {
      return null;
    }
    return { promptTokens: value.promptTokens, completionTokens: value.completionTokens };
  }

  private reservation(requestId: string, grantId: string): ReservationRow | undefined {
    return this.rows<ReservationRow>(
      `SELECT request_id, grant_id, utc_day, reserved_neurons, accounted_neurons,
        provider_prompt_tokens, provider_completion_tokens, model, status, settlement_state,
        failure_classification, slot_active, reconciliation_action, reconciliation_evidence_hash
       FROM reservations WHERE request_id = ? AND grant_id = ?`,
      requestId,
      grantId,
    )[0];
  }

  private rows<Row extends Record<string, SqlStorageValue>>(query: string, ...bindings: SqlStorageValue[]): Row[] {
    return this.ctx.storage.sql.exec<Row>(query, ...bindings).toArray();
  }
}
