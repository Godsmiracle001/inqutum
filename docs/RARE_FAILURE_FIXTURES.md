# Rare-failure fixture generator (#483)

Source: `backend/src/sandbox/rare-failure-fixtures.ts`  
Tests: `backend/tests/rare-failure-fixtures.test.ts`

The fixture registry covers normal payment and webhook flows, malformed or
hostile settlement cases, bounded retries and dead-letter recovery, worker
lease reclamation, maintainer approval, authorization expiry, webhook replay,
and audit-chain tampering.

## Reproducibility

Time-dependent generators accept an optional `Date` anchor. Supply the same
anchor to reproduce identical timestamps and signatures across runs:

```ts
const anchor = new Date('2026-11-21T12:00:00.000Z');
const fixture = createStaleJobLockRecoveryFixture(anchor);
```

The default remains the current time for compatibility with existing tests
that intentionally exercise freshness windows. No random identifiers are
needed for these fixtures; payment hashes and audit payloads remain synthetic.

## Edge cases and recovery behavior

| Case | Expected result | Recovery |
| --- | --- | --- |
| Underpaid payment or wrong asset issuer | Reject settlement | Correct payment; never mark invoice paid |
| Network mismatch or expired invoice | Fail closed | Switch to the invoice network or request a new invoice |
| Dead-letter job | Stop automatic attempts after retry budget | Requeue only after investigation |
| Expired worker lease | Reclaim the abandoned job | New worker claims it under a fresh lease |
| Rate limit | Respect `Retry-After` and bounded exponential backoff | Retry after the delay |
| Missing second maintainer approval | Refuse privileged execution | Obtain approval from a different maintainer |
| Expired intent or stale webhook timestamp | Reject execution/delivery | Create a fresh intent or signed delivery |
| Forged webhook signature | Reject payload | Recompute signature with the configured secret |
| Tampered audit chain | Verification fails at the modified event | Preserve evidence and investigate; do not rewrite history |

## Verification

Run from `backend/`:

```bash
node --import tsx --test tests/rare-failure-fixtures.test.ts
```

The suite verifies normal, failure, retry and authorization paths, and asserts
that fixed anchors produce byte-equivalent fixtures. The fixtures are
in-memory test data only; they do not write to the database. No schema
migration is required.
