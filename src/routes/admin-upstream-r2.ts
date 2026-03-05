import { Hono } from 'hono';
import { getStub } from '../do-stub';
import type { HonoEnv } from '../types';

// ─── Admin: Upstream R2 Endpoint Management ─────────────────────────────────

export const adminUpstreamR2App = new Hono<HonoEnv>();

// ─── Create ─────────────────────────────────────────────────────────────────

adminUpstreamR2App.post('/', async (c) => {
	const log: Record<string, unknown> = {
		route: 'admin.createUpstreamR2',
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
		console.log(JSON.stringify(log));
		return c.json({ success: false, errors: [{ code: 400, message: 'Required field: name (string)' }] }, 400);
	}
	if (!raw.access_key_id || typeof raw.access_key_id !== 'string') {
		log.status = 400;
		console.log(JSON.stringify(log));
		return c.json({ success: false, errors: [{ code: 400, message: 'Required field: access_key_id (string)' }] }, 400);
	}
	if (!raw.secret_access_key || typeof raw.secret_access_key !== 'string') {
		log.status = 400;
		console.log(JSON.stringify(log));
		return c.json({ success: false, errors: [{ code: 400, message: 'Required field: secret_access_key (string)' }] }, 400);
	}
	if (!raw.endpoint || typeof raw.endpoint !== 'string') {
		log.status = 400;
		console.log(JSON.stringify(log));
		return c.json({ success: false, errors: [{ code: 400, message: 'Required field: endpoint (string URL)' }] }, 400);
	}
	if (!Array.isArray(raw.bucket_names) || raw.bucket_names.length === 0 || !raw.bucket_names.every((b: unknown) => typeof b === 'string')) {
		log.status = 400;
		console.log(JSON.stringify(log));
		return c.json(
			{
				success: false,
				errors: [{ code: 400, message: 'Required field: bucket_names (non-empty array of strings, or ["*"])' }],
			},
			400,
		);
	}

	const identity = c.get('accessIdentity');
	const stub = getStub(c.env);
	const result = await stub.createUpstreamR2({
		name: raw.name,
		access_key_id: raw.access_key_id,
		secret_access_key: raw.secret_access_key,
		endpoint: raw.endpoint,
		bucket_names: raw.bucket_names as string[],
		created_by: identity?.email ?? (typeof raw.created_by === 'string' ? raw.created_by : undefined),
	});

	log.status = 200;
	log.endpointId = result.endpoint.id;
	log.bucketNames = raw.bucket_names;
	console.log(JSON.stringify(log));

	return c.json({ success: true, result: result.endpoint });
});

// ─── List ───────────────────────────────────────────────────────────────────

adminUpstreamR2App.get('/', async (c) => {
	const statusFilter = c.req.query('status') as 'active' | 'revoked' | undefined;
	const validFilters = ['active', 'revoked'];
	const filter = statusFilter && validFilters.includes(statusFilter) ? statusFilter : undefined;

	const stub = getStub(c.env);
	const endpoints = await stub.listUpstreamR2(filter);

	console.log(
		JSON.stringify({
			route: 'admin.listUpstreamR2',
			filter: filter ?? 'all',
			count: endpoints.length,
			ts: new Date().toISOString(),
		}),
	);

	return c.json({ success: true, result: endpoints });
});

// ─── Get ────────────────────────────────────────────────────────────────────

adminUpstreamR2App.get('/:id', async (c) => {
	const id = c.req.param('id');
	const stub = getStub(c.env);
	const result = await stub.getUpstreamR2(id);

	if (!result) {
		return c.json({ success: false, errors: [{ code: 404, message: 'Upstream R2 endpoint not found' }] }, 404);
	}

	return c.json({ success: true, result: result.endpoint });
});

// ─── Revoke ─────────────────────────────────────────────────────────────────

adminUpstreamR2App.delete('/:id', async (c) => {
	const id = c.req.param('id');
	const stub = getStub(c.env);
	const revoked = await stub.revokeUpstreamR2(id);

	console.log(
		JSON.stringify({
			route: 'admin.revokeUpstreamR2',
			endpointId: id,
			revoked,
			ts: new Date().toISOString(),
		}),
	);

	if (!revoked) {
		return c.json({ success: false, errors: [{ code: 404, message: 'Upstream R2 endpoint not found or already revoked' }] }, 404);
	}

	return c.json({ success: true, result: { revoked: true } });
});
