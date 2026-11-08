import {
  estimateNeuronUsageForModel,
  GEMMA_MODEL,
  QWEN_MODEL,
  type ReportedTokenUsage,
  type SupportedModel,
} from './ai.ts';

const MAX_REQUEST_BYTES = 2_048;
const MAX_BUDGET_NEURONS = 1_000_000;
const MAX_CONCURRENCY = 100;
const MAX_IN_FLIGHT_REQUESTS = 100;
const MAX_DIAGNOSTIC_RESERVATIONS = 100;
const UNRESOLVED_RESERVATION_STATUSES = ['RESERVED', 'INFERENCE_STARTED', 'UNKNOWN_USAGE'] as const;

type ControllerEnvironment = {
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

  constructor(
    ctx: DurableObjectState,
    env: ControllerEnvironment,
  ) {
    this.ctx = ctx;
    this.env = env;
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
      const body = await this.readBody(request);
      if (!body) return jsonResponse({ error: 'INVALID_REQUEST' }, 400);

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

  private admit(body: Record<string, unknown>): Record<string, unknown> {
    const requestId = body.requestId;
    const estimatedNeurons = body.estimatedNeurons;
    const model = body.model;
    const nowMs = body.nowMs === undefined ? Date.now() : body.nowMs;
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

    return this.ctx.storage.transactionSync(() => {
      if (this.rows('SELECT request_id FROM reservations WHERE request_id = ?', requestId).length > 0) {
        return { granted: false, reason: 'duplicate_request' };
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
      if (Number(daily.settled_neurons) + Number(daily.reserved_neurons) + estimatedNeurons > budget) {
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
      return { granted: true, requestId, grantId, utcDay: day, reservedNeurons: estimatedNeurons };
    });
  }

  private start(body: Record<string, unknown>): Record<string, unknown> {
    const identity = this.identity(body);
    if (!identity) return { started: false, reason: 'invalid_request' };
    const nowMs = body.nowMs === undefined ? Date.now() : body.nowMs;
    if (typeof nowMs !== 'number' || !Number.isSafeInteger(nowMs) || nowMs < 0) {
      return { started: false, reason: 'invalid_request' };
    }
    return this.ctx.storage.transactionSync(() => {
      const reservation = this.reservation(identity.requestId, identity.grantId);
      if (!reservation || reservation.status === 'RECONCILED') return { started: false, reason: 'unknown_grant' };
      if (reservation.status === 'INFERENCE_STARTED') return { started: true, duplicate: true };
      if (reservation.status !== 'RESERVED') return { started: false, reason: 'already_settled' };
      this.ctx.storage.sql.exec(
        `UPDATE reservations SET status = 'INFERENCE_STARTED', inference_started_at = ?
         WHERE request_id = ? AND grant_id = ? AND status = 'RESERVED'`,
        nowMs,
        identity.requestId,
        identity.grantId,
      );
      return { started: true };
    });
  }

  private settle(body: Record<string, unknown>): Record<string, unknown> {
    const identity = this.identity(body);
    const outcome = body.outcome;
    const terminal = body.terminal;
    const failureClassification = body.failureClassification;
    const nowMs = body.nowMs === undefined ? Date.now() : body.nowMs;
    const suppliedUsage = body.usage !== undefined;
    if (!identity || !['completed', 'failed', 'not_started'].includes(String(outcome))
      || typeof terminal !== 'boolean' || typeof failureClassification !== 'string'
      || failureClassification.length > 64 || typeof nowMs !== 'number'
      || !Number.isSafeInteger(nowMs) || nowMs < 0
      || (outcome === 'completed' && !terminal)
      || (outcome === 'not_started' && (terminal !== true || suppliedUsage))) {
      return { settled: false, reason: 'invalid_request' };
    }

    return this.ctx.storage.transactionSync(() => {
      const reservation = this.reservation(identity.requestId, identity.grantId);
      if (!reservation) return { settled: false, reason: 'unknown_grant' };
      const usage = suppliedUsage ? this.usage(body.usage, reservation.model) : null;
      if (suppliedUsage && !usage) return { settled: false, reason: 'invalid_usage' };
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
    const result = this.ctx.storage.transactionSync(() => {
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

    const day = utcDay(Date.now());
    if (!day) return jsonResponse({ error: 'STATUS_UNAVAILABLE' }, 503);

    const daily = this.rows<{ settled_neurons: number; reserved_neurons: number }>(
      'SELECT settled_neurons, reserved_neurons FROM daily_budgets WHERE utc_day = ?',
      day,
    )[0];
    const activeSlots = this.rows<{ count: number }>(
      'SELECT COUNT(*) AS count FROM reservations WHERE slot_active = 1',
    )[0];
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
      unresolvedReservationCount,
      reservationStates,
      unresolvedReservations,
      unresolvedReservationDetailsTruncated: unresolvedReservationCount > unresolvedReservations.length,
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
  ): boolean {
    if (reservation.status === 'RECONCILED') {
      return reservation.settlement_state === 'RECONCILED'
        && reservation.failure_classification === 'INFERENCE_NOT_DISPATCHED'
        && outcome === 'not_started'
        && terminal
        && failureClassification === 'INFERENCE_NOT_DISPATCHED'
        && usage === null;
    }

    const expectedOutcome = reservation.status === 'COMPLETED'
      ? 'completed'
      : ['FAILED_WITH_KNOWN_USAGE', 'UNKNOWN_USAGE'].includes(reservation.status)
        ? 'failed'
        : null;
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
