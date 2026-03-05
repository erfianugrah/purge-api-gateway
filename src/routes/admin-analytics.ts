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

	const query: AnalyticsQuery = {
		zone_id: c.req.query('zone_id') || undefined,
		key_id: c.req.query('key_id') || undefined,
		since: c.req.query('since') ? Number(c.req.query('since')) : undefined,
		until: c.req.query('until') ? Number(c.req.query('until')) : undefined,
		limit: c.req.query('limit') ? Number(c.req.query('limit')) : undefined,
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

	const query: AnalyticsQuery = {
		zone_id: c.req.query('zone_id') || undefined,
		key_id: c.req.query('key_id') || undefined,
		since: c.req.query('since') ? Number(c.req.query('since')) : undefined,
		until: c.req.query('until') ? Number(c.req.query('until')) : undefined,
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
