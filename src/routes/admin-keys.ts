import { Hono } from 'hono';
import { validatePolicy } from '../policy-engine';
import { getStub } from '../do-stub';
import { parseBulkBody, resolveCreatedBy } from './admin-helpers';
import type { CreateKeyRequest, HonoEnv } from '../types';
import type { GatewayConfig } from '../config-registry';
import type { PolicyDocument } from '../policy-types';

// ─── Admin: Purge Key Management ────────────────────────────────────────────

export const adminKeysApp = new Hono<HonoEnv>();

// ─── Create key ─────────────────────────────────────────────────────────────

adminKeysApp.post('/', async (c) => {
	const log: Record<string, unknown> = {
		route: 'admin.createKey',
		ts: new Date().toISOString(),
	};

	let raw: Record<string, unknown>;
	try {
		raw = await c.req.json<Record<string, unknown>>();
	} catch {
		log.status = 400;
		log.error = 'invalid_json';
		console.log(JSON.stringify(log));
		return c.json({ success: false, errors: [{ code: 400, message: 'Invalid JSON body' }] }, 400);
	}

	if (!raw.name || typeof raw.name !== 'string') {
		log.status = 400;
		log.error = 'missing_name';
		console.log(JSON.stringify(log));
		return c.json({ success: false, errors: [{ code: 400, message: 'Required field: name (string)' }] }, 400);
	}
	if (raw.zone_id !== undefined && typeof raw.zone_id !== 'string') {
		log.status = 400;
		log.error = 'invalid_zone_id';
		console.log(JSON.stringify(log));
		return c.json({ success: false, errors: [{ code: 400, message: 'zone_id must be a string if provided' }] }, 400);
	}

	if (!raw.policy || typeof raw.policy !== 'object') {
		log.status = 400;
		log.error = 'missing_policy';
		console.log(JSON.stringify(log));
		return c.json({ success: false, errors: [{ code: 400, message: 'Required field: policy (object with version + statements)' }] }, 400);
	}

	const policyErrors = validatePolicy(raw.policy);
	if (policyErrors.length > 0) {
		log.status = 400;
		log.error = 'invalid_policy';
		log.policyErrors = policyErrors;
		console.log(JSON.stringify(log));
		return c.json(
			{
				success: false,
				errors: policyErrors.map((e) => ({
					code: 400,
					message: `${e.path}: ${e.message}`,
				})),
			},
			400,
		);
	}

	if (raw.expires_in_days !== undefined) {
		if (typeof raw.expires_in_days !== 'number' || raw.expires_in_days <= 0 || !isFinite(raw.expires_in_days)) {
			log.status = 400;
			log.error = 'invalid_expires_in_days';
			console.log(JSON.stringify(log));
			return c.json({ success: false, errors: [{ code: 400, message: 'expires_in_days must be a positive finite number' }] }, 400);
		}
	}

	const stub = getStub(c.env);

	const rateLimit =
		raw.rate_limit != null && typeof raw.rate_limit === 'object'
			? validateRateLimitFields(raw.rate_limit as Record<string, unknown>)
			: undefined;
	if (rateLimit === 'invalid') {
		log.status = 400;
		log.error = 'invalid_rate_limit';
		console.log(JSON.stringify(log));
		return c.json(
			{
				success: false,
				errors: [
					{ code: 400, message: 'rate_limit fields must be positive finite numbers (bulk_rate, bulk_bucket, single_rate, single_bucket)' },
				],
			},
			400,
		);
	}
	if (rateLimit) {
		const gwConfig = await stub.getConfig();
		const rateLimitError = validateRateLimits(rateLimit, gwConfig);
		if (rateLimitError) {
			log.status = 400;
			log.error = 'rate_limit_exceeds_account';
			console.log(JSON.stringify(log));
			return c.json({ success: false, errors: [{ code: 400, message: rateLimitError }] }, 400);
		}
	}

	const identity = c.get('accessIdentity');
	const req: CreateKeyRequest = {
		name: raw.name as string,
		zone_id: typeof raw.zone_id === 'string' ? raw.zone_id : undefined,
		policy: raw.policy as PolicyDocument,
		created_by: resolveCreatedBy(identity, raw.created_by),
		expires_in_days: typeof raw.expires_in_days === 'number' ? raw.expires_in_days : undefined,
		rate_limit: rateLimit,
	};

	log.zoneId = req.zone_id ?? 'none';
	log.keyName = req.name;
	log.statementCount = req.policy.statements.length;
	const result = await stub.createKey(req);

	log.status = 200;
	log.keyId = result.key.id.slice(0, 12) + '...';
	console.log(JSON.stringify(log));

	return c.json({ success: true, result });
});

// ─── List keys ──────────────────────────────────────────────────────────────

adminKeysApp.get('/', async (c) => {
	const zoneId = c.req.query('zone_id') || undefined;

	const statusFilter = c.req.query('status') as 'active' | 'revoked' | undefined;
	const validFilters = ['active', 'revoked'];
	const filter = statusFilter && validFilters.includes(statusFilter) ? statusFilter : undefined;

	const stub = getStub(c.env);
	const keys = await stub.listKeys(zoneId, filter);

	console.log(
		JSON.stringify({
			route: 'admin.listKeys',
			zoneId: zoneId ?? 'all',
			filter: filter ?? 'all',
			count: keys.length,
			ts: new Date().toISOString(),
		}),
	);

	return c.json({ success: true, result: keys });
});

// ─── Get key ────────────────────────────────────────────────────────────────

adminKeysApp.get('/:id', async (c) => {
	const zoneId = c.req.query('zone_id') || undefined;
	const keyId = c.req.param('id');
	const stub = getStub(c.env);
	const result = await stub.getKey(keyId);

	if (!result || (zoneId && result.key.zone_id !== zoneId)) {
		return c.json({ success: false, errors: [{ code: 404, message: 'Key not found' }] }, 404);
	}

	return c.json({ success: true, result });
});

// ─── Revoke / delete key ────────────────────────────────────────────────────

adminKeysApp.delete('/:id', async (c) => {
	const zoneId = c.req.query('zone_id') || undefined;
	const permanent = c.req.query('permanent') === 'true';
	const keyId = c.req.param('id');
	const stub = getStub(c.env);

	const existing = await stub.getKey(keyId);
	if (!existing || (zoneId && existing.key.zone_id !== zoneId)) {
		return c.json({ success: false, errors: [{ code: 404, message: 'Key not found' }] }, 404);
	}

	if (permanent) {
		const deleted = await stub.deleteKey(keyId);

		console.log(
			JSON.stringify({
				route: 'admin.deleteKey',
				zoneId: existing.key.zone_id,
				keyId: keyId.slice(0, 12) + '...',
				deleted,
				ts: new Date().toISOString(),
			}),
		);

		if (!deleted) {
			return c.json({ success: false, errors: [{ code: 404, message: 'Key not found' }] }, 404);
		}

		return c.json({ success: true, result: { deleted: true } });
	}

	const revoked = await stub.revokeKey(keyId);

	console.log(
		JSON.stringify({
			route: 'admin.revokeKey',
			zoneId: existing.key.zone_id,
			keyId: keyId.slice(0, 12) + '...',
			revoked,
			ts: new Date().toISOString(),
		}),
	);

	if (!revoked) {
		return c.json({ success: false, errors: [{ code: 404, message: 'Key not found or already revoked' }] }, 404);
	}

	return c.json({ success: true, result: { revoked: true } });
});

// ─── Bulk revoke ────────────────────────────────────────────────────────────

adminKeysApp.post('/bulk-revoke', async (c) => {
	const log: Record<string, unknown> = { route: 'admin.bulkRevokeKeys', ts: new Date().toISOString() };

	const body = await parseBulkBody(c, 'ids');
	if (body instanceof Response) return body;

	const { ids, dryRun } = body;
	const stub = getStub(c.env);

	if (dryRun) {
		const preview = await stub.bulkInspectKeys(ids, 'revoked');
		log.status = 200;
		log.dryRun = true;
		log.count = ids.length;
		console.log(JSON.stringify(log));
		return c.json({ success: true, result: preview });
	}

	const result = await stub.bulkRevokeKeys(ids);
	log.status = 200;
	log.processed = result.processed;
	console.log(JSON.stringify(log));
	return c.json({ success: true, result });
});

// ─── Bulk delete ────────────────────────────────────────────────────────────

adminKeysApp.post('/bulk-delete', async (c) => {
	const log: Record<string, unknown> = { route: 'admin.bulkDeleteKeys', ts: new Date().toISOString() };

	const body = await parseBulkBody(c, 'ids');
	if (body instanceof Response) return body;

	const { ids, dryRun } = body;
	const stub = getStub(c.env);

	if (dryRun) {
		const preview = await stub.bulkInspectKeys(ids, 'deleted');
		log.status = 200;
		log.dryRun = true;
		log.count = ids.length;
		console.log(JSON.stringify(log));
		return c.json({ success: true, result: preview });
	}

	const result = await stub.bulkDeleteKeys(ids);
	log.status = 200;
	log.processed = result.processed;
	console.log(JSON.stringify(log));
	return c.json({ success: true, result });
});

// ─── Private helpers ────────────────────────────────────────────────────────

/** Validate and extract rate_limit fields from raw input. Returns parsed object, undefined, or 'invalid'. */
function validateRateLimitFields(raw: Record<string, unknown>): CreateKeyRequest['rate_limit'] | undefined | 'invalid' {
	const fields = ['bulk_rate', 'bulk_bucket', 'single_rate', 'single_bucket'] as const;
	const result: Record<string, number | null> = {};
	let hasAny = false;
	for (const field of fields) {
		const val = raw[field];
		if (val === undefined || val === null) {
			result[field] = null;
			continue;
		}
		if (typeof val !== 'number' || val <= 0 || !isFinite(val)) {
			return 'invalid';
		}
		result[field] = val;
		hasAny = true;
	}
	if (!hasAny) return undefined;
	return result as unknown as CreateKeyRequest['rate_limit'];
}

/** Validate per-key rate limits against account defaults. Returns error string or null. */
function validateRateLimits(rl: NonNullable<CreateKeyRequest['rate_limit']>, config: GatewayConfig): string | null {
	const errors: string[] = [];
	if (rl.bulk_rate != null && rl.bulk_rate > config.bulk_rate) {
		errors.push(`bulk_rate ${rl.bulk_rate} exceeds account default ${config.bulk_rate}`);
	}
	if (rl.bulk_bucket != null && rl.bulk_bucket > config.bulk_bucket_size) {
		errors.push(`bulk_bucket ${rl.bulk_bucket} exceeds account default ${config.bulk_bucket_size}`);
	}
	if (rl.single_rate != null && rl.single_rate > config.single_rate) {
		errors.push(`single_rate ${rl.single_rate} exceeds account default ${config.single_rate}`);
	}
	if (rl.single_bucket != null && rl.single_bucket > config.single_bucket_size) {
		errors.push(`single_bucket ${rl.single_bucket} exceeds account default ${config.single_bucket_size}`);
	}
	if (errors.length > 0) {
		return `Per-key rate limits must not exceed account defaults: ${errors.join('; ')}`;
	}
	return null;
}
