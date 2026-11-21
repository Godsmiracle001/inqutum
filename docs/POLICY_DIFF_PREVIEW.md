# Permission-diff preview before policy changes (#486)

Source: `backend/src/domain/policy-diff.ts`  
Tests: `backend/tests/policy-diff.test.ts`

`previewPolicyChange(current, proposed, actor)` is read-only. It returns
field-level before/after values, classifies restrictive and permissive changes,
and fingerprints both policy versions. Only OWNER and ADMIN may preview or
apply a change.

Increasing the maximum invoice amount or widening the asset allow-list is a
less restrictive change and requires explicit approval. An empty asset
allow-list means all assets are accepted, so changing from empty to a populated
list is restrictive (and the reverse is permissive).

Before persistence, call `applyReviewedPolicyPreview` with the same current and
proposed policy. It rechecks the actor, verifies that neither fingerprint has
changed, and enforces approval. This prevents a stale preview from overwriting
a concurrent update.

## Recovery and compatibility

This is additive: existing `BusinessPolicy`, environment overrides and invoice
validation behavior are unchanged. The preview helper does not write to storage.
Persist the complete returned policy as one transaction/versioned document;
if persistence fails, roll back the transaction and retain the previous policy.
Rebuild the preview after a concurrent update. No schema migration is required.
