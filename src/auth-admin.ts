/**
 * Admin authentication middleware.
 *
 * Two auth paths:
 * 1. Cloudflare Access JWT (dashboard SSO) — provides admin access + identity
 * 2. X-Admin-Key header (CLI / automation) — provides admin access, no identity
 *
 * Access JWT is checked first so dashboard users get identity attached to tokens.
 * CF Access is only enforced at the edge on /dashboard/*, but the CF_Authorization
 * cookie is sent on /admin/* calls from the SPA, so the worker can read it here.
 */

import type { Context, Next } from 'hono';
import { validateAccessJwt } from './auth-access';
import { timingSafeEqual } from './crypto';
import type { HonoEnv } from './types';

/** Hono middleware that gates admin routes with Access JWT or X-Admin-Key. */
export async function adminAuth(c: Context<HonoEnv>, next: Next): Promise<Response | void> {
	// 1. Try Cloudflare Access JWT — provides identity for dashboard SSO users
	if (c.env.CF_ACCESS_TEAM_NAME && c.env.CF_ACCESS_AUD) {
		const identity = await validateAccessJwt(c.req.raw, c.env.CF_ACCESS_TEAM_NAME, c.env.CF_ACCESS_AUD);
		if (identity) {
			c.set('accessIdentity', identity);
			await next();
			return;
		}
	}

	// 2. Fall back to X-Admin-Key — for CLI and automation
	const adminKey = c.req.header('X-Admin-Key');
	if (adminKey && (await timingSafeEqual(adminKey, c.env.ADMIN_KEY))) {
		await next();
		return;
	}

	return c.json({ success: false, errors: [{ code: 401, message: 'Unauthorized' }] }, 401);
}
