import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DEFAULT_POLICY, type BusinessPolicy } from '../src/domain/policy';
import { applyReviewedPolicyPreview, previewPolicyChange } from '../src/domain/policy-diff';

const owner = { id: 'owner-1', role: 'OWNER' as const };
const admin = { id: 'admin-1', role: 'ADMIN' as const };
const viewer = { id: 'viewer-1', role: 'VIEWER' as const };

function policy(patch: Partial<BusinessPolicy['invoice']>): BusinessPolicy {
  return { ...DEFAULT_POLICY, invoice: { ...DEFAULT_POLICY.invoice, ...patch } };
}

describe('permission diff preview before policy changes (#486)', () => {
  it('returns a deterministic read-only field diff', () => {
    const current = policy({ maxAmount: 1000, allowedAssets: [] });
    const proposed = policy({ maxAmount: 500, allowedAssets: ['XLM'] });
    const before = structuredClone(current);
    const preview = previewPolicyChange(current, proposed, admin);
    assert.equal(preview.allowed, true);
    assert.deepEqual(current, before);
    assert.ok(preview.changes.some((item) => item.path === 'invoice.maxAmount' && item.impact === 'more_restrictive'));
    assert.ok(preview.changes.some((item) => item.path === 'invoice.allowedAssets' && item.impact === 'more_restrictive'));
    assert.equal(preview.requiresApproval, false);
    assert.deepEqual(preview, previewPolicyChange(current, proposed, admin));
  });

  it('requires approval when a policy change widens permissions', () => {
    const current = policy({ maxAmount: 100, allowedAssets: ['XLM'] });
    const proposed = policy({ maxAmount: 200, allowedAssets: [] });
    const preview = previewPolicyChange(current, proposed, owner);
    assert.equal(preview.requiresApproval, true);
    assert.throws(() => applyReviewedPolicyPreview(current, proposed, preview, owner, false), /POLICY_APPROVAL_REQUIRED/);
    assert.deepEqual(applyReviewedPolicyPreview(current, proposed, preview, owner, true), proposed);
  });

  it('denies viewers and reports unchanged policies', () => {
    assert.equal(previewPolicyChange(DEFAULT_POLICY, policy({}), viewer).reason, 'POLICY_PREVIEW_FORBIDDEN');
    assert.equal(previewPolicyChange(DEFAULT_POLICY, structuredClone(DEFAULT_POLICY), owner).reason, 'POLICY_UNCHANGED');
  });

  it('rejects a preview if the current policy changed after review', () => {
    const current = policy({ maxAmount: 100 });
    const proposed = policy({ maxAmount: 200 });
    const preview = previewPolicyChange(current, proposed, admin);
    assert.throws(() => applyReviewedPolicyPreview(policy({ maxAmount: 90 }), proposed, preview, admin, true), /POLICY_PREVIEW_STALE/);
  });

  it('rechecks authorization at apply time', () => {
    const proposed = policy({ maxAmount: 200 });
    const preview = previewPolicyChange(DEFAULT_POLICY, proposed, admin);
    assert.throws(() => applyReviewedPolicyPreview(DEFAULT_POLICY, proposed, preview, viewer, true), /POLICY_PREVIEW_FORBIDDEN/);
  });
});
