import { Hono } from 'hono';
import { adminAuth } from '../auth-admin';
import { adminKeysApp } from './admin-keys';
import { adminAnalyticsApp } from './admin-analytics';
import { adminS3App } from './admin-s3';
import { adminUpstreamTokensApp } from './admin-upstream-tokens';
import { adminUpstreamR2App } from './admin-upstream-r2';
import type { HonoEnv } from '../types';

// ─── Admin compositor ───────────────────────────────────────────────────────
// Thin shell that mounts auth middleware and delegates to domain sub-apps.

export const adminApp = new Hono<HonoEnv>();

adminApp.use('*', adminAuth);
adminApp.route('/keys', adminKeysApp);
adminApp.route('/analytics', adminAnalyticsApp);
adminApp.route('/s3', adminS3App);
adminApp.route('/upstream-tokens', adminUpstreamTokensApp);
adminApp.route('/upstream-r2', adminUpstreamR2App);
