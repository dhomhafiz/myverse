# AI Companion recovery implementation and rollout

The authenticated legacy bridge and approved quarantine were deployed and verified. Bounded recovery was activated with finite exposure caps; existing model, inference, and budget settings were preserved.

## Policy and exposure limits

Recovery is **off by default**. Optional configuration (not added to the production Wrangler variables):

| Variable | Values / meaning |
| --- | --- |
| `AI_RECOVERY_MODE` | Missing/`off`: strict admission, no automatic release. `observe`: journal recovery candidates without releasing or charging them. `bounded`: enable fenced quarantine only with valid caps and alarm support. |
| `AI_MAX_UNCERTAIN_ATTEMPTS` | Required positive integer, at most 100, for bounded mode. Counts **all** nonterminal v2 attempts, including owned, not-yet-dispatched and quarantined attempts. |
| `AI_MAX_UNCERTAIN_NEURONS` | Required positive integer, at most 1,000,000, for bounded mode. Sum of `max(reservation, accounted charge)` for those attempts. These are estimated neurons, not an exact provider invoice cap. |

Production recovery is in **bounded** mode with finite exposure caps. The local regression example uses **2 attempts / 1000 estimated neurons**. One quarantined attempt can coexist with one new owner. If both remain unknown, further admission fails closed. The caps apply atomically at admission, before any possible dispatch; no expiry removes an attempt from exposure.

Bounded recovery can permit **more than one physical provider inference** despite normal logical concurrency of one. It does not prove cancellation or enforce provider-side fencing. A suspended old Worker can dispatch late; its exposure permit remains held, keeping the total number of possible provider executions finite. Provider dispatch is never retried. No automatic model retry is introduced.

Ownership leases last **30 seconds**, with an absolute deadline **60 seconds from admission**. Heartbeats cannot extend beyond that deadline or revive an expired owner. The existing user-facing inference timeout remains **15 seconds**. A lease expiry causes quarantine, not a claim that provider execution ended. Invalid caps, unsupported modes, or absent alarm APIs use strict admission. Alarm/storage failures prevent dispatch or leave conservative tracked state.

Turning recovery off after quarantine blocks new admission while retired unknown exposure exists. Old-protocol admission cannot bypass newer exposure. An old binary that ignores these safeguards is not a safe rollback target while such attempts exist.

## Lifecycle and accounting

The Worker creates distinct reservation, attempt, owner and command IDs. Admission, start and settlement use durable command receipts. Retries reuse a command ID; different command IDs cannot obtain a second dispatch authorization for an already-started attempt. A lost start response is replayed only within the same pre-dispatch Worker continuation. A newly received HTTP request always creates a new identity.

Each budget command has a one-second bound covering both fetch and response-body decoding and at most two attempts. Ambiguous start outcomes never dispatch inference. The same Worker may report `not_started` only because it has not called the provider. If that cleanup also fails, the watchdog retains conservative exposure.

Alarms are armed before committing managed work, avoiding a commit-before-watchdog crash window. Recovery sweeps run on alarms and admission. Alarm scheduling is serialized. A failed alarm explicitly schedules another wakeup before propagating the error. Recovery, ownership changes, command receipts, accounting and lifecycle transitions share synchronous SQLite transactions.

Quarantine converts an outstanding reservation into a provisional charge exactly once, releases only that reservation's logical slot, and retains unknown exposure. Already-accounted estimates are not charged twice. Late verified final usage updates the original day's charge by a recorded delta. It cannot release a newer row's slot, restore ownership, or overwrite prior final/operator evidence. Conflicting evidence is rejected. Late provisional reports cannot overwrite final usage.

Provider promise resolution is terminal evidence even if response normalization fails. A rejected transport or an abort request alone remains uncertain. Late resolved responses are observed before the local abort check and can settle the original attempt. Execution context retention is best effort and runtime bounded; alarms and conservative exposure remain authoritative when no callback survives.

Every daily row equals the sum of reserved and accounted reservation entries for that day. New admission checks the existing daily total plus the proposed reservation and nonterminal exposure from earlier UTC days. Verified actual estimated usage is never clamped: a larger final charge is recorded and blocks subsequent admission when over budget. The existing estimator and safety margin are preserved; neither its heuristic reservation nor the local ledger guarantees a hard cap on Cloudflare's actual bill.

## Additive migration and legacy protection

Constructor migrations use `CREATE TABLE/INDEX IF NOT EXISTS` only. Existing reservation and daily-budget rows are not rewritten or backfilled into managed execution state.

New tables:

- `execution_attempts`: identity, generation, deadlines, outcome, recovery state and evidence references.
- `recovery_sequence`: durable monotonic fencing generation.
- `lifecycle_receipts`: validated command fingerprints and results.
- `lifecycle_events`: deduplicated lifecycle facts and provisional/final phases.
- `accounting_adjustments`: original-day reservation and charge deltas.
- `legacy_exposures`: exact legacy quarantine state and retained unknown-provider exposure.

Legacy rows have no execution metadata and are excluded from automatic quarantine. An authenticated `POST /internal/budget/recovery` action can apply only `legacy_unknown_to_quarantine` to one fixed legacy reservation. It requires the caller's expected persisted status and amount to match, observe mode with alarms, a valid safety configuration, intact daily accounting invariants, the target to be the sole active slot, and sufficient remaining exposure and daily-budget capacity. It never uses provider termination evidence. Production applied this action once after the authenticated state and safety configuration passed; the durable unknown exposure remains auditable.

The transition is transactional and idempotent. It keeps the legacy reservation, moves its reserved amount to a provisional settled charge, writes the existing accounting adjustment journal and a durable `legacy_exposures` ledger row with provider outcome `UNKNOWN`, then releases only that reservation's active slot. Unknown legacy exposure participates in admission, start, carry-budget and uncertainty-cap checks. A later terminal provider settlement may establish completion/failure, but its estimated charge cannot reduce the provisional floor or change a newer reservation's slot. The production transition remains gated on authenticated live state passing every check.

## Correlation and privacy

Essential lifecycle and accounting records live in SQLite, independent of sampled console logs. The journal includes admitted, dispatch intent, observed provider acceptance/completion, deadline/cancellation intent, quarantine, recovery and settlement events. Acceptance recorded from a resolved completion is an observation at completion time, not an earlier provider acknowledgement timestamp.

Reservation ID links the Worker invocation's application correlation ID to the Durable Object. Attempt ID, owner ID and generation identify execution ownership. A validated ingress `cf-ray` value is captured when available, as a distinct identifier. Provider request IDs remain nullable: the current direct binding does not provide a durable per-call job/status handle through the interface used here. The implementation does not guess a mapping from a response's arbitrary `id` or a shared last-request property.

No questions, prompts, answers, request headers, raw error payloads, credentials or admin secrets are persisted. Command fingerprints include only validated fields relevant to the operation. Operator evidence is hashed as before. Authenticated status adds recovery policy, exposure and bounded diagnostic attempt details; its reads do not mutate recovery state.

## Local acceptance and failure simulations

The existing SQLite fixture is reused and extended with alarm/clock support. Existing tests retain their assertions. Additional tests check database sums, adjustment sums, ownership and exposure, not just HTTP responses. Miniflare/workerd tests use the installed Wrangler toolchain; no dependencies were added.

| Acceptance criterion | Local status |
| --- | --- |
| Admission/start/settlement receipts, replay, response loss after commits, no redispatch | PASS |
| Successful completion without usage and duplicate settlement | PASS |
| Bounded command execution, including a stalled response body | PASS |
| Pre-dispatch start ambiguity and client disconnection | PASS |
| Provider failure, timeout/cancellation uncertainty, interruption and delayed completion | PASS |
| Worker retention after disconnect; durable fallback if retention ends | PASS |
| Durable Object reopen/eviction, SQLite migration and real alarm execution | PASS |
| Lease expiration, capped heartbeat, absolute deadline and duplicate alarm execution | PASS |
| Generation mismatch, recovery/settlement races and concurrent operator corrections | PASS |
| Finite attempt and neuron exposure, strict fallback, observation mode and rollback-to-off behavior | PASS |
| Daily budget exhaustion, unclamped usage, audited corrections and UTC rollover | PASS |
| Legacy incident protection, historical totals and old-protocol bypass protection | PASS |
| Authenticated exact-ID legacy quarantine, provisional accounting, cap/budget gates, delayed settlement and SQLite persistence | PASS |
| Structured durable events and sensitive metadata rejection | PASS |
| Production bridge deployment, preserved configuration and health | PASS; verified during rollout |
| Authenticated production status, exact legacy quarantine and provisional accounting | PASS; target remained auditable as `UNKNOWN_USAGE`, with unknown provider outcome and released logical slot. |
| Provider-side cancellation and external provider-ID correlation | NOT VERIFIED; no real inference or cancellation was attempted |

Validation commands from the Worker directory:

```text
npm.cmd run typecheck
npm.cmd run lint
node --experimental-strip-types --test --test-reporter=spec tests/*.test.mjs
```

Final validation on 8 November 2026:

| Check | Result |
| --- | --- |
| Complete Worker regression suite, including real workerd alarm/eviction integration | PASS: 169 tests, 0 failures, 0 skipped/cancelled |
| Companion client regression suite | PASS: 23 tests, 0 failures, 0 skipped/cancelled |
| Worker TypeScript and ESLint | PASS |
| Application ESLint and production-build TypeScript | PASS |
| Local production Worker bundle (existing esbuild) | PASS |
| Next.js production static build | PASS; initial sandbox font download failure resolved by rerunning with network access |
| Static-export verification | PASS: 10 routes, 24 production assets, 14 excluded assets absent; third-party notices intact |
| Git whitespace validation | PASS |
| Production deployment, configuration preservation and Worker health | PASS |
| Legacy incident recovery and bounded-mode activation | PASS; health and authenticated status succeeded |

The rollout preserved existing production settings and bindings. No real provider inference or cancellation was attempted.

### Windows credential reuse

The admin token is stored as a Windows generic credential under `MyVerse/Cloudflare/myverse-ai-api/Admin`. From `cloudflare\myverse-ai-api`, run:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\Get-ProductionStatus.ps1
```

The process-scoped execution-policy option does not change the machine or user policy. The helper reads the credential through Windows Credential Manager's `CredReadW` API and uses it only in the in-process `Authorization` header for the read-only status endpoint. It prints a bounded diagnostic summary, never the token. For other explicitly authorized maintenance, retrieve the same target in-process and use the credential only in the request header; do not print it, pass it in arguments or URLs, export it to an environment variable, or write it to a file.

Exact implementation files changed:

- `src/recovery.ts` (new): additive recovery schema, policy, exposure, alarms, events and accounting journal.
- `src/budget-controller.ts`: v2 receipts, admission replay, fenced lifecycle handling, correction logic, recovery hooks and read-only status.
- `src/worker.ts`: bounded/replayed lifecycle commands, invocation ownership, ingress correlation, pre-dispatch cleanup and disconnect retention.
- `src/ai.ts`: retain underlying execution and observe late resolved responses before local abort rejection.
- `tests/budget-controller.test.mjs`: reuse/extend SQLite fixtures and add lifecycle/accounting/failure regression cases.
- `tests/diagnostics.test.mjs`: update successful command mocks to the v2 fencing contract; existing behavior assertions retained.
- `tests/helpers/budget-binding.mjs`: common v2 fencing response fixture.
- `tests/recovery-runtime.test.mjs` (new): local workerd SQLite, receipt replay, real alarm wakeup and eviction integration.
- `RECOVERY.md` (new): this consolidated acceptance, policy and rollout report.

The pre-existing root `package-lock.json` working-tree change was left in place. The temporary deploy configuration was removed after deployment; the production Wrangler configuration and generated Worker environment types were not changed. No dependency declarations were added.

## Production prerequisites and rollback

1. Preserve production settings and bindings and keep the admin secret out of logs and files. Deploy with existing variables preserved; do not overwrite live configuration with local `AI_ENABLED=false` defaults.
2. Before any future recovery transition, retrieve authenticated status and verify the exact legacy record, daily totals/invariants, active slot ownership, caps, alarm support and configuration.
3. Execute the exact-ID bridge only if every in-code gate passes. Verify its durable charge, adjustment, unknown exposure and released logical slot afterward. Never substitute `confirm_not_started` or `confirm_terminated_unknown`.
4. Bounded overlap is explicitly accepted only within the configured 2-attempt / 2000-neuron limits; this does not prove that the legacy provider stopped. The present quarantined attempt may still be running. Do not initiate provider inference as part of recovery verification.
5. Roll back behavior by selecting off mode while retaining journals, charges and quarantines. Before any old-binary rollback, prove no live recovery state will be ignored. Never reset the Durable Object or delete recovery tables.

If authenticated production state or any safety precondition cannot be verified, do not mutate the reservation. Age, a new deployment or a cancellation request is not evidence that the provider stopped. The provisional charge accepts the bounded possibility of overlap and does not claim that the legacy inference ended.
