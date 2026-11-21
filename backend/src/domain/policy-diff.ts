/**
 * Read-only permission and business-policy diff preview (#486).
 *
 * The preview is deterministic and carries fingerprints for both versions.
 * A caller must revalidate the current fingerprint immediately before
 * persisting the proposed policy, preventing a stale preview from overwriting
 * a concurrent policy update.
 */
import { createHash } from 'node:crypto';
import type { BusinessPolicy } from './policy';
import type { CollaborationRole } from './invitation';
import { ROLE_HIERARCHY } from './invitation';

export interface PolicyDiffEntry {
  path: string;
  before: unknown;
  after: unknown;
  impact: 'more_restrictive' | 'less_restrictive' | 'changed';
}

export interface PolicyDiffPreview {
  allowed: boolean;
  changes: PolicyDiffEntry[];
  currentFingerprint: string;
  proposedFingerprint: string;
  requiresApproval: boolean;
  reason?: 'POLICY_PREVIEW_FORBIDDEN' | 'POLICY_UNCHANGED';
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stable(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? String(value);
}

export function policyFingerprint(policy: BusinessPolicy): string {
  return createHash('sha256').update(stable(policy)).digest('hex');
}

function classifyChange(path: string, before: unknown, after: unknown): PolicyDiffEntry['impact'] {
  const parts = path.split('.');
  const key = parts[parts.length - 1];
  if (key === 'minAmount' || key === 'minExpiryDays') {
    return Number(after) > Number(before) ? 'more_restrictive' : 'less_restrictive';
  }
  if (key === 'maxAmount' || key === 'maxExpiryDays') {
    return Number(after) < Number(before) ? 'more_restrictive' : 'less_restrictive';
  }
  if (key === 'allowedAssets' && Array.isArray(before) && Array.isArray(after)) {
    // An empty allow-list means all assets are accepted.
    if (before.length === 0 && after.length > 0) return 'more_restrictive';
    if (before.length > 0 && after.length === 0) return 'less_restrictive';
    const oldSet = new Set(before.map(String));
    const newSet = new Set(after.map(String));
    if ([...newSet].every((value) => oldSet.has(value))) return 'more_restrictive';
    if ([...oldSet].every((value) => newSet.has(value))) return 'less_restrictive';
  }
  return 'changed';
}

function collectDiff(before: unknown, after: unknown, path: string, output: PolicyDiffEntry[]): void {
  if (stable(before) === stable(after)) return;
  if (before && after && typeof before === 'object' && typeof after === 'object' &&
      !Array.isArray(before) && !Array.isArray(after)) {
    const left = before as Record<string, unknown>;
    const right = after as Record<string, unknown>;
    const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])].sort();
    for (const key of keys) collectDiff(left[key], right[key], path ? `${path}.${key}` : key, output);
    return;
  }
  output.push({ path, before, after, impact: classifyChange(path, before, after) });
}

const canManagePolicy = (role: CollaborationRole): boolean => ROLE_HIERARCHY[role] >= ROLE_HIERARCHY.ADMIN;

export function previewPolicyChange(
  current: BusinessPolicy,
  proposed: BusinessPolicy,
  actor: { id: string; role: CollaborationRole },
): PolicyDiffPreview {
  const currentFingerprint = policyFingerprint(current);
  const proposedFingerprint = policyFingerprint(proposed);
  if (!canManagePolicy(actor.role)) {
    return { allowed: false, changes: [], currentFingerprint, proposedFingerprint, requiresApproval: false, reason: 'POLICY_PREVIEW_FORBIDDEN' };
  }
  const changes: PolicyDiffEntry[] = [];
  collectDiff(current, proposed, '', changes);
  return {
    allowed: changes.length > 0,
    changes,
    currentFingerprint,
    proposedFingerprint,
    requiresApproval: changes.some((change) => change.impact !== 'more_restrictive'),
    ...(changes.length === 0 ? { reason: 'POLICY_UNCHANGED' as const } : {}),
  };
}

/**
 * Final guard for the persistence layer. Persist the returned whole policy in
 * one transaction; if persistence fails, retain the old version unchanged.
 */
export function applyReviewedPolicyPreview(
  current: BusinessPolicy,
  proposed: BusinessPolicy,
  preview: PolicyDiffPreview,
  actor: { id: string; role: CollaborationRole },
  approved: boolean,
): BusinessPolicy {
  if (!canManagePolicy(actor.role)) throw new Error('POLICY_PREVIEW_FORBIDDEN');
  if (!preview.allowed || preview.currentFingerprint !== policyFingerprint(current) ||
      preview.proposedFingerprint !== policyFingerprint(proposed)) {
    throw new Error('POLICY_PREVIEW_STALE');
  }
  if (preview.requiresApproval && !approved) throw new Error('POLICY_APPROVAL_REQUIRED');
  return structuredClone(proposed);
}
