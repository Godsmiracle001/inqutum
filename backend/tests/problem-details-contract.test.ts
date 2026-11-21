import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DOMAIN_ERROR_TAXONOMY } from '../src/errors/error-taxonomy';
import { PROBLEM_CONTENT_TYPE, PROBLEM_TYPE_BASE, problemTypeUri, toProblemDetails } from '../src/errors/problem-details';

describe('stable problem-details public contract (#487)', () => {
  it('keeps every registered code aligned with its canonical metadata', () => {
    const codes = Object.keys(DOMAIN_ERROR_TAXONOMY);
    assert.ok(codes.length > 0);
    assert.equal(new Set(codes).size, codes.length);
    for (const code of codes) {
      const definition = DOMAIN_ERROR_TAXONOMY[code];
      assert.equal(definition.code, code);
      assert.ok(definition.httpStatus >= 400 && definition.httpStatus <= 599, code);
      assert.ok(definition.category, code);
      assert.equal(typeof definition.retryable, 'boolean');
      assert.ok(definition.userSafeMessage.length > 0, code);
      assert.ok(definition.recoveryAction.length > 0, code);
      assert.equal(problemTypeUri(code), `${PROBLEM_TYPE_BASE}${code.toLowerCase().replace(/_/g, '-')}`);
    }
  });

  it('preserves problem type and code across occurrences while varying instance details', () => {
    const a = toProblemDetails({ success: false, error: 'First event', code: 'MEMO_MISMATCH', correlationId: 'trace-a' });
    const b = toProblemDetails({ success: false, error: 'Second event', code: 'MEMO_MISMATCH', correlationId: 'trace-b' });
    assert.equal(a.type, b.type);
    assert.equal(a.code, b.code);
    assert.notEqual(a.instance, b.instance);
    assert.notEqual(a.detail, b.detail);
  });

  it('keeps transient errors retryable and authorization denials fail-closed', () => {
    const transient = toProblemDetails({ success: false, error: 'Temporary outage', code: 'HORIZON_UNAVAILABLE' });
    const denied = toProblemDetails({ success: false, error: 'Not permitted', code: 'UNAUTHORIZED_SELLER' });
    assert.equal(transient.status, 503);
    assert.equal(transient.retryable, true);
    assert.equal(denied.status, 403);
    assert.equal(denied.category, 'AUTHORIZATION');
    assert.equal(denied.retryable, false);
  });

  it('redacts sensitive details and retains the documented media type', () => {
    const problem = toProblemDetails({
      success: false,
      error: 'Connection failed: postgres://user:secret@db.internal/app',
      code: 'INTERNAL_ERROR',
    });
    assert.doesNotMatch(problem.detail, /postgres:\/\//);
    assert.doesNotMatch(problem.detail, /secret/);
    assert.equal(PROBLEM_CONTENT_TYPE, 'application/problem+json');
  });
});
