/** Local ownership is independent of provider termination and budget settlement. */
export const EXECUTION_DEADLINE_MS = 60_000;
export const EXECUTION_LEASE_MS = 30_000;
export const LEGACY_RESERVATION_ID = 'f76b5698-de35-4539-b3a9-7a973653a2a4';
export const LEGACY_RESERVED_NEURONS = 217;

export type RecoveryEnvironment = {
  AI_RECOVERY_MODE?: string;
  AI_MAX_UNCERTAIN_ATTEMPTS?: string;
  AI_MAX_UNCERTAIN_NEURONS?: string;
};

export type ExecutionAttempt = {
  request_id: string; grant_id: string; attempt_id: string; owner_id: string;
  generation: number; lease_expires_at: number; deadline_at: number;
  provider_outcome: string; recovery_state: string; admitted_at: number;
};

export function safeId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
}

export class RecoveryLedger {
  private readonly storage: DurableObjectStorage;
  private readonly env: RecoveryEnvironment;
  private scheduleTail: Promise<void> = Promise.resolve();
  constructor(storage: DurableObjectStorage, env: RecoveryEnvironment) {
    this.storage = storage;
    this.env = env;
    storage.sql.exec(`CREATE TABLE IF NOT EXISTS execution_attempts (
      request_id TEXT PRIMARY KEY, grant_id TEXT NOT NULL UNIQUE,
      attempt_id TEXT NOT NULL UNIQUE, owner_id TEXT NOT NULL,
      generation INTEGER NOT NULL UNIQUE, lease_expires_at INTEGER NOT NULL,
      deadline_at INTEGER NOT NULL, admitted_at INTEGER NOT NULL,
      provider_outcome TEXT NOT NULL DEFAULT 'UNKNOWN', recovery_state TEXT NOT NULL DEFAULT 'OWNED',
      ingress_ray_id TEXT, provider_request_id TEXT, evidence_ref TEXT, terminal_at INTEGER
    )`);
    storage.sql.exec(`CREATE INDEX IF NOT EXISTS attempts_due ON execution_attempts(recovery_state, lease_expires_at)`);
    storage.sql.exec(`CREATE TABLE IF NOT EXISTS recovery_sequence (id INTEGER PRIMARY KEY CHECK(id = 1), generation INTEGER NOT NULL)`);
    storage.sql.exec(`INSERT OR IGNORE INTO recovery_sequence VALUES (1, 0)`);
    storage.sql.exec(`CREATE TABLE IF NOT EXISTS lifecycle_receipts (
      command_id TEXT PRIMARY KEY, request_id TEXT NOT NULL, fingerprint TEXT NOT NULL, result TEXT NOT NULL
    )`);
    storage.sql.exec(`CREATE TABLE IF NOT EXISTS lifecycle_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT, request_id TEXT NOT NULL, attempt_id TEXT NOT NULL,
      generation INTEGER NOT NULL, event TEXT NOT NULL, phase TEXT NOT NULL, at INTEGER NOT NULL,
      UNIQUE(request_id, event, generation, phase)
    )`);
    storage.sql.exec(`CREATE TABLE IF NOT EXISTS accounting_adjustments (
      id INTEGER PRIMARY KEY AUTOINCREMENT, request_id TEXT NOT NULL, utc_day TEXT NOT NULL,
      reserved_delta INTEGER NOT NULL, settled_delta INTEGER NOT NULL, reason TEXT NOT NULL, at INTEGER NOT NULL
    )`);
    storage.sql.exec(`CREATE TABLE IF NOT EXISTS legacy_exposures (
      request_id TEXT PRIMARY KEY, expected_status TEXT NOT NULL, provisional_neurons INTEGER NOT NULL,
      provider_outcome TEXT NOT NULL CHECK(provider_outcome IN ('UNKNOWN', 'COMPLETED', 'FAILED')),
      recovery_state TEXT NOT NULL CHECK(recovery_state IN ('QUARANTINED', 'TERMINAL')),
      quarantined_at INTEGER NOT NULL, terminal_at INTEGER,
      failure_classification TEXT, provider_prompt_tokens INTEGER, provider_completion_tokens INTEGER
    )`);
  }

  rows<T extends Record<string, SqlStorageValue>>(sql: string, ...args: SqlStorageValue[]): T[] {
    return this.storage.sql.exec<T>(sql, ...args).toArray();
  }

  policy() {
    const integer = (value: string | undefined, max: number) => {
      if (!value || !/^[1-9]\d*$/.test(value)) return null;
      const n = Number(value);
      return Number.isSafeInteger(n) && n <= max ? n : null;
    };
    const attempts = integer(this.env.AI_MAX_UNCERTAIN_ATTEMPTS, 100);
    const neurons = integer(this.env.AI_MAX_UNCERTAIN_NEURONS, 1_000_000);
    const alarmsAvailable = typeof this.storage.getAlarm === 'function' && typeof this.storage.setAlarm === 'function';
    const valid = attempts !== null && neurons !== null && alarmsAvailable;
    const mode = this.env.AI_RECOVERY_MODE === 'observe' && alarmsAvailable ? 'observe'
      : this.env.AI_RECOVERY_MODE === 'bounded' && valid ? 'bounded' : 'off';
    return { mode, attempts, neurons, alarmsAvailable, strict: mode !== 'bounded' };
  }

  attempt(requestId: string): ExecutionAttempt | undefined {
    return this.rows<ExecutionAttempt>('SELECT * FROM execution_attempts WHERE request_id = ?', requestId)[0];
  }

  matches(a: ExecutionAttempt, body: Record<string, unknown>): boolean {
    return body.attemptId === a.attempt_id && body.ownerId === a.owner_id && body.generation === a.generation;
  }

  create(requestId: string, grantId: string, attemptId: string, ownerId: string, now: number, ingressRayId: string | null = null) {
    if (Number(this.rows<{ generation: number }>('SELECT generation FROM recovery_sequence WHERE id = 1')[0].generation) >= Number.MAX_SAFE_INTEGER) {
      throw new Error('Fencing sequence exhausted.');
    }
    this.storage.sql.exec('UPDATE recovery_sequence SET generation = generation + 1 WHERE id = 1');
    const generation = Number(this.rows<{ generation: number }>('SELECT generation FROM recovery_sequence WHERE id = 1')[0].generation);
    this.storage.sql.exec(`INSERT INTO execution_attempts
      (request_id, grant_id, attempt_id, owner_id, generation, lease_expires_at, deadline_at, admitted_at, ingress_ray_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, requestId, grantId, attemptId, ownerId, generation,
    now + EXECUTION_LEASE_MS, now + EXECUTION_DEADLINE_MS, now, ingressRayId);
    const a = this.attempt(requestId)!;
    this.event(a, 'admitted', now);
    return a;
  }

  event(a: ExecutionAttempt, event: string, now: number, phase = '') {
    this.storage.sql.exec(`INSERT OR IGNORE INTO lifecycle_events
      (request_id, attempt_id, generation, event, phase, at) VALUES (?, ?, ?, ?, ?, ?)`,
    a.request_id, a.attempt_id, a.generation, event, phase, now);
  }

  exposure(day?: string) {
    const filter = day === undefined ? '' : ' WHERE utc_day != ?';
    const values = day === undefined ? [] : [day];
    return this.rows<{ count: number; neurons: number }>(`SELECT COUNT(*) AS count, COALESCE(SUM(neurons), 0) AS neurons
      FROM (
        SELECT MAX(r.reserved_neurons, r.accounted_neurons) AS neurons, r.utc_day
        FROM execution_attempts e JOIN reservations r ON r.request_id = e.request_id
        WHERE e.provider_outcome = 'UNKNOWN'
        UNION ALL
        SELECT MAX(r.reserved_neurons, r.accounted_neurons) AS neurons, r.utc_day
        FROM legacy_exposures l JOIN reservations r ON r.request_id = l.request_id
        WHERE l.provider_outcome = 'UNKNOWN'
      )${filter}`, ...values)[0];
  }

  legacyActive(): number {
    return Number(this.rows<{ count: number }>(`SELECT COUNT(*) AS count FROM reservations r
      LEFT JOIN execution_attempts e ON e.request_id = r.request_id
      WHERE r.slot_active = 1 AND e.request_id IS NULL`)[0].count);
  }

  legacyUnknown(): number {
    return Number(this.rows<{ count: number }>(
      `SELECT COUNT(*) AS count FROM legacy_exposures WHERE provider_outcome = 'UNKNOWN'`,
    )[0].count);
  }

  accounting(requestId: string, reservedBefore: number, settledBefore: number, reason: string, now: number) {
    const r = this.rows<{ utc_day: string; reserved_neurons: number; accounted_neurons: number; settlement_state: string }>(
      'SELECT utc_day, reserved_neurons, accounted_neurons, settlement_state FROM reservations WHERE request_id = ?', requestId)[0];
    const reservedAfter = r.settlement_state === 'RESERVED' ? Number(r.reserved_neurons) : 0;
    const settledAfter = Number(r.accounted_neurons);
    if (reservedAfter === reservedBefore && settledAfter === settledBefore) return;
    this.storage.sql.exec(`INSERT INTO accounting_adjustments
      (request_id, utc_day, reserved_delta, settled_delta, reason, at) VALUES (?, ?, ?, ?, ?, ?)`,
    requestId, r.utc_day, reservedAfter - reservedBefore, settledAfter - settledBefore, reason, now);
  }

  /** Called inside the controller transaction. Legacy rows are never selected. */
  sweep(now: number) {
    const { mode } = this.policy();
    if (mode === 'off') return;
    const due = this.rows<ExecutionAttempt>(`SELECT * FROM execution_attempts
      WHERE recovery_state = 'OWNED' AND (lease_expires_at <= ? OR deadline_at <= ?)`, now, now);
    for (const a of due) {
      if (mode === 'observe') { this.event(a, 'recovery_would_apply', now); continue; }
      const r = this.rows<{ settlement_state: string; reserved_neurons: number; accounted_neurons: number; utc_day: string }>(
        'SELECT settlement_state, reserved_neurons, accounted_neurons, utc_day FROM reservations WHERE request_id = ?', a.request_id)[0];
      // Account conservatively even when dispatch cannot be proved. Never infer termination.
      if (r.settlement_state === 'RESERVED') {
        this.storage.sql.exec(`UPDATE daily_budgets SET reserved_neurons = reserved_neurons - ?,
          settled_neurons = settled_neurons + ?, updated_at = ? WHERE utc_day = ?`,
        r.reserved_neurons, r.reserved_neurons, now, r.utc_day);
        this.storage.sql.exec(`UPDATE reservations SET accounted_neurons = reserved_neurons, settlement_state = 'SETTLED', status = 'UNKNOWN_USAGE',
          usage_source = 'provisional_unknown_exposure', failure_classification = 'OWNERSHIP_EXPIRED'
          WHERE request_id = ?`, a.request_id);
        this.accounting(a.request_id, Number(r.reserved_neurons), Number(r.accounted_neurons), 'QUARANTINE', now);
      }
      this.storage.sql.exec(`UPDATE execution_attempts SET recovery_state = 'QUARANTINED'
        WHERE request_id = ? AND generation = ? AND recovery_state = 'OWNED'`, a.request_id, a.generation);
      this.storage.sql.exec('UPDATE reservations SET slot_active = 0 WHERE request_id = ? AND grant_id = ?', a.request_id, a.grant_id);
      this.event(a, now >= a.deadline_at ? 'deadline_exceeded' : 'lease_expired', now);
      this.event(a, 'quarantined', now);
      this.event(a, 'recovery_applied', now);
    }
  }

  private serializeAlarm(action: () => Promise<void>): Promise<void> {
    const pending = this.scheduleTail.then(action);
    this.scheduleTail = pending.catch(() => {});
    return pending;
  }

  /** Arm BEFORE committing new work, so a crash between commit and response cannot lose its watchdog. */
  arm(now: number): Promise<void> {
    return this.serializeAlarm(async () => {
      if (this.policy().mode === 'off') return;
      const current = await this.storage.getAlarm();
      if (current === null || current > now + EXECUTION_LEASE_MS) await this.storage.setAlarm(now + EXECUTION_LEASE_MS);
    });
  }

  schedule(now: number): Promise<void> {
    return this.serializeAlarm(async () => {
      if (this.policy().mode === 'off') return;
      const next = this.rows<{ due: number | null }>(`SELECT MIN(MIN(lease_expires_at, deadline_at)) AS due
      FROM execution_attempts WHERE recovery_state = 'OWNED'
      AND (lease_expires_at > ? AND deadline_at > ?)`, now, now)[0].due;
      if (next !== null) {
        const current = await this.storage.getAlarm();
        if (current === null || current <= now || current > Number(next)) await this.storage.setAlarm(Number(next));
      }
    });
  }
}
