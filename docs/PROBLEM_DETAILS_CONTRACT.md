# Stable Problem-Details error taxonomy (#487)

The canonical registry is `backend/src/errors/error-taxonomy.ts`; response
serialization is handled by `backend/src/errors/problem-details.ts`. Failures
use `application/problem+json` and retain the legacy `success: false`,
`error` and `code` fields for existing clients.

Run from `backend/`:

```bash
node --import tsx --test tests/problem-details-contract.test.ts tests/problem-details.test.ts
```

## Public compatibility rules

- Error codes are append-only identifiers: never rename or repurpose a code.
- A code maps to a stable lower-kebab-case URI under
  `https://quittance.app/errors/`.
- HTTP status, category and retryability are part of the public contract.
- A retryable error means the same request may succeed without changing input.
  Authorization and validation denials remain non-retryable.
- Error details must be redacted; never expose credentials, database URLs,
  stack traces, secrets or internal file paths.
- Correlation ids identify individual occurrences and do not change the
  canonical problem type.

## Migration and rollback

This contribution adds contract verification and documentation without
changing existing codes or response fields. If a future release needs a
different status or meaning, introduce a versioned/new code and keep the old
mapping available while clients migrate. Reverting these additions requires no
database migration and does not alter runtime behavior.
