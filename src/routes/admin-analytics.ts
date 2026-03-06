import { Hono } from 'hono';
import { queryEvents, querySummary } from '../analytics';
import type { AnalyticsQuery } from '../analytics';
import type { HonoEnv } from '../types';

// ─── Admin: Purge Analytics ─────────────────────────────────────────────────

export const adminAnalyticsApp = new Hono<HonoEnv>();

// ─── Events ─────────────────────────────────────────────────────────────────

adminAnalyticsApp.get('/events', async (c) => {
	if (!c.env.ANALYTICS_DB) {
		return c.json({ success: false, errors: [{ code: 503, message: 'Analytics not configured' }] }, 503);
	}

	const sinceRaw = c.req.query('since') ? Number(c.req.query('since')) : undefined;
	const untilRaw = c.req.query('until') ? Number(c.req.query('until')) : undefined;
	const limitRaw = c.req.query('limit') ? Number(c.req.query('limit')) : undefined;

	if (
		(sinceRaw !== undefined && isNaN(sinceRaw)) ||
		(untilRaw !== undefined && isNaN(untilRaw)) ||
		(limitRaw !== undefined && isNaN(limitRaw))
	) {
		return c.json({ success: false, errors: [{ code: 400, message: 'since, until, and limit must be valid numbers' }] }, 400);
	}

	const query: AnalyticsQuery = {
		zone_id: c.req.query('zone_id') || undefined,
		key_id: c.req.query('key_id') || undefined,
		since: sinceRaw,
		until: untilRaw,
		limit: limitRaw,
	};

	const events = await queryEvents(c.env.ANALYTICS_DB, query);

	console.log(
		JSON.stringify({
			route: 'admin.analytics.events',
			zoneId: query.zone_id ?? 'all',
			count: events.length,
			ts: new Date().toISOString(),
		}),
	);

	return c.json({ success: true, result: events });
});

// ─── Summary ────────────────────────────────────────────────────────────────

adminAnalyticsApp.get('/summary', async (c) => {
	if (!c.env.ANALYTICS_DB) {
		return c.json({ success: false, errors: [{ code: 503, message: 'Analytics not configured' }] }, 503);
	}

	const sinceRaw = c.req.query('since') ? Number(c.req.query('since')) : undefined;
	const untilRaw = c.req.query('until') ? Number(c.req.query('until')) : undefined;

	if ((sinceRaw !== undefined && isNaN(sinceRaw)) || (untilRaw !== undefined && isNaN(untilRaw))) {
		return c.json({ success: false, errors: [{ code: 400, message: 'since and until must be valid numbers' }] }, 400);
	}

	const query: AnalyticsQuery = {
		zone_id: c.req.query('zone_id') || undefined,
		key_id: c.req.query('key_id') || undefined,
		since: sinceRaw,
		until: untilRaw,
	};

	const summary = await querySummary(c.env.ANALYTICS_DB, query);

	console.log(
		JSON.stringify({
			route: 'admin.analytics.summary',
			zoneId: query.zone_id ?? 'all',
			totalRequests: summary.total_requests,
			ts: new Date().toISOString(),
		}),
	);

	return c.json({ success: true, result: summary });
});
