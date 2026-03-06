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
	const stub = getStub(c.env);
	const tokens = await stub.listUpstreamTokens();

	console.log(
		JSON.stringify({
			route: 'admin.listUpstreamTokens',
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

// ─── Delete ─────────────────────────────────────────────────────────────────

adminUpstreamTokensApp.delete('/:id', async (c) => {
	const id = c.req.param('id');
	const stub = getStub(c.env);
	const deleted = await stub.deleteUpstreamToken(id);

	console.log(
		JSON.stringify({
			route: 'admin.deleteUpstreamToken',
			tokenId: id,
			deleted,
			ts: new Date().toISOString(),
		}),
	);

	if (!deleted) {
		return c.json({ success: false, errors: [{ code: 404, message: 'Upstream token not found' }] }, 404);
	}

	return c.json({ success: true, result: { deleted: true } });
});

// ─── Bulk delete ────────────────────────────────────────────────────────────

const MAX_BULK_ITEMS = 100;

adminUpstreamTokensApp.post('/bulk-delete', async (c) => {
	const log: Record<string, unknown> = { route: 'admin.bulkDeleteUpstreamTokens', ts: new Date().toISOString() };

	const body = await parseBulkBody(c);
	if (body instanceof Response) return body;

	const { ids, dryRun } = body;
	const stub = getStub(c.env);

	if (dryRun) {
		const preview = await stub.bulkInspectUpstreamTokens(ids, 'deleted');
		log.status = 200;
		log.dryRun = true;
		log.count = ids.length;
		console.log(JSON.stringify(log));
		return c.json({ success: true, result: preview });
	}

	const result = await stub.bulkDeleteUpstreamTokens(ids);
	log.status = 200;
	log.processed = result.processed;
	console.log(JSON.stringify(log));
	return c.json({ success: true, result });
});

// ─── Private helpers ────────────────────────────────────────────────────────

/** Parse and validate a bulk operation request body. */
async function parseBulkBody(c: {
	req: { json: <T>() => Promise<T> };
	json: (data: unknown, status: number) => Response;
}): Promise<{ ids: string[]; dryRun: boolean } | Response> {
	let raw: Record<string, unknown>;
	try {
		raw = await c.req.json<Record<string, unknown>>();
	} catch {
		return c.json({ success: false, errors: [{ code: 400, message: 'Invalid JSON body' }] }, 400);
	}

	const ids = raw.ids;
	if (!Array.isArray(ids) || ids.length === 0 || !ids.every((id) => typeof id === 'string')) {
		return c.json({ success: false, errors: [{ code: 400, message: 'ids must be a non-empty array of strings' }] }, 400);
	}

	if (ids.length > MAX_BULK_ITEMS) {
		return c.json({ success: false, errors: [{ code: 400, message: `Maximum ${MAX_BULK_ITEMS} items per request` }] }, 400);
	}

	if (typeof raw.confirm_count !== 'number' || raw.confirm_count !== ids.length) {
		return c.json(
			{
				success: false,
				errors: [{ code: 400, message: `confirm_count must equal ids array length (${ids.length})` }],
			},
			400,
		);
	}

	const dryRun = raw.dry_run === true;
	return { ids: ids as string[], dryRun };
}
