import { Hono } from 'hono';
import { getStub } from '../do-stub';
import type { HonoEnv } from '../types';

// ─── Admin: Upstream CF API Token Management ────────────────────────────────

export const adminUpstreamTokensApp = new Hono<HonoEnv>();

// ─── Create ─────────────────────────────────────────────────────────────────

adminUpstreamTokensApp.post('/', async (c) => {
	const log: Record<string, unknown> = {
		route: 'admin.createUpstreamToken',
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
	if (!raw.token || typeof raw.token !== 'string') {
		log.status = 400;
		console.log(JSON.stringify(log));
		return c.json({ success: false, errors: [{ code: 400, message: 'Required field: token (string)' }] }, 400);
	}
	if (!Array.isArray(raw.zone_ids) || raw.zone_ids.length === 0 || !raw.zone_ids.every((z: unknown) => typeof z === 'string')) {
		log.status = 400;
		console.log(JSON.stringify(log));
		return c.json(
			{ success: false, errors: [{ code: 400, message: 'Required field: zone_ids (non-empty array of strings, or ["*"])' }] },
			400,
		);
	}

	const identity = c.get('accessIdentity');
	const stub = getStub(c.env);
	const result = await stub.createUpstreamToken({
		name: raw.name,
		token: raw.token,
		zone_ids: raw.zone_ids as string[],
		created_by: identity?.email ?? (typeof raw.created_by === 'string' ? raw.created_by : undefined),
	});

	log.status = 200;
	log.tokenId = result.token.id;
	log.zoneIds = raw.zone_ids;
	console.log(JSON.stringify(log));

	return c.json({ success: true, result: result.token });
});

// ─── List ───────────────────────────────────────────────────────────────────

adminUpstreamTokensApp.get('/', async (c) => {
	const statusFilter = c.req.query('status') as 'active' | 'revoked' | undefined;
	const validFilters = ['active', 'revoked'];
	const filter = statusFilter && validFilters.includes(statusFilter) ? statusFilter : undefined;

	const stub = getStub(c.env);
	const tokens = await stub.listUpstreamTokens(filter);

	console.log(
		JSON.stringify({
			route: 'admin.listUpstreamTokens',
			filter: filter ?? 'all',
			count: tokens.length,
			ts: new Date().toISOString(),
		}),
	);

	return c.json({ success: true, result: tokens });
});

// ─── Get ────────────────────────────────────────────────────────────────────

adminUpstreamTokensApp.get('/:id', async (c) => {
	const id = c.req.param('id');
	const stub = getStub(c.env);
	const result = await stub.getUpstreamToken(id);

	if (!result) {
		return c.json({ success: false, errors: [{ code: 404, message: 'Upstream token not found' }] }, 404);
	}

	return c.json({ success: true, result: result.token });
});

// ─── Revoke ─────────────────────────────────────────────────────────────────

adminUpstreamTokensApp.delete('/:id', async (c) => {
	const id = c.req.param('id');
	const stub = getStub(c.env);
	const revoked = await stub.revokeUpstreamToken(id);

	console.log(
		JSON.stringify({
			route: 'admin.revokeUpstreamToken',
			tokenId: id,
			revoked,
			ts: new Date().toISOString(),
		}),
	);

	if (!revoked) {
		return c.json({ success: false, errors: [{ code: 404, message: 'Upstream token not found or already revoked' }] }, 404);
	}

	return c.json({ success: true, result: { revoked: true } });
});
