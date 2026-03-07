/** Shared helpers for admin route handlers. */

import type { AccessIdentity } from '../auth-access';

// ─── Constants ──────────────────────────────────────────────────────────────

export const MAX_BULK_ITEMS = 100;

// ─── Identity resolution ────────────────────────────────────────────────────

/** Unverified prefix applied to self-reported created_by values (non-SSO callers). */
const UNVERIFIED_PREFIX = 'unverified:';

/**
 * Resolve created_by from SSO identity or request body.
 * SSO-verified emails are stored as-is; self-reported values from the request body
 * are prefixed with "unverified:" so audit trails distinguish trust levels.
 */
export function resolveCreatedBy(identity: AccessIdentity | undefined, rawCreatedBy: unknown): string | undefined {
	if (identity?.email) return identity.email;
	if (typeof rawCreatedBy === 'string' && rawCreatedBy.length > 0) return `${UNVERIFIED_PREFIX}${rawCreatedBy}`;
	return undefined;
}

// ─── Bulk body parsing ──────────────────────────────────────────────────────

/** Minimal Hono-like context shape needed for bulk body parsing. */
interface BulkBodyContext {
	req: { json: <T>() => Promise<T> };
	json: (data: unknown, status: number) => Response;
}

/** Parse and validate a bulk operation request body. Returns parsed data or a 400 Response. */
export async function parseBulkBody(c: BulkBodyContext, idField: string = 'ids'): Promise<{ ids: string[]; dryRun: boolean } | Response> {
	let raw: Record<string, unknown>;
	try {
		raw = await c.req.json<Record<string, unknown>>();
	} catch {
		return c.json({ success: false, errors: [{ code: 400, message: 'Invalid JSON body' }] }, 400);
	}

	const ids = raw[idField];
	if (!Array.isArray(ids) || ids.length === 0 || !ids.every((id) => typeof id === 'string')) {
		return c.json({ success: false, errors: [{ code: 400, message: `${idField} must be a non-empty array of strings` }] }, 400);
	}

	if (ids.length > MAX_BULK_ITEMS) {
		return c.json({ success: false, errors: [{ code: 400, message: `Maximum ${MAX_BULK_ITEMS} items per request` }] }, 400);
	}

	if (typeof raw.confirm_count !== 'number' || raw.confirm_count !== ids.length) {
		return c.json(
			{
				success: false,
				errors: [{ code: 400, message: `confirm_count must equal ${idField} array length (${ids.length})` }],
			},
			400,
		);
	}

	const dryRun = raw.dry_run === true;
	return { ids: ids as string[], dryRun };
}
