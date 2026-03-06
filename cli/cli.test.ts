import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { formatDuration, parsePolicy } from './ui.js';
import { resolveConfig, resolveZoneId } from './client.js';

// ---------- parsePolicy ----------

describe('parsePolicy', () => {
	beforeEach(() => {
		vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);
		vi.spyOn(console, 'error').mockImplementation(() => {});
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('parses inline JSON', () => {
		const policy = parsePolicy('{"version":"2025-01-01","statements":[{"actions":["purge:*"],"resources":["*"],"conditions":[]}]}');
		expect(policy).toEqual({
			version: '2025-01-01',
			statements: [{ actions: ['purge:*'], resources: ['*'], conditions: [] }],
		});
	});

	it('parses minimal policy', () => {
		const policy = parsePolicy('{"version":"2025-01-01","statements":[]}');
		expect(policy).toEqual({ version: '2025-01-01', statements: [] });
	});

	it('reads from @file path', () => {
		const tmpFile = join(tmpdir(), `test-policy-${Date.now()}.json`);
		writeFileSync(tmpFile, '{"version":"2025-01-01","statements":[]}');
		try {
			const policy = parsePolicy(`@${tmpFile}`);
			expect(policy).toEqual({ version: '2025-01-01', statements: [] });
		} finally {
			unlinkSync(tmpFile);
		}
	});

	it('exits on invalid JSON', () => {
		parsePolicy('not json at all');
		expect(process.exit).toHaveBeenCalledWith(1);
	});

	it('exits on missing file', () => {
		parsePolicy('@nonexistent-file-that-does-not-exist.json');
		expect(process.exit).toHaveBeenCalledWith(1);
	});
});

// ---------- formatDuration ----------

describe('formatDuration', () => {
	it('formats milliseconds under 1s', () => {
		expect(formatDuration(0)).toBe('0ms');
		expect(formatDuration(1)).toBe('1ms');
		expect(formatDuration(150)).toBe('150ms');
		expect(formatDuration(999)).toBe('999ms');
	});

	it('formats seconds at 1s boundary', () => {
		expect(formatDuration(1000)).toBe('1.0s');
	});

	it('formats seconds with decimal', () => {
		expect(formatDuration(1500)).toBe('1.5s');
		expect(formatDuration(2345)).toBe('2.3s');
		expect(formatDuration(10000)).toBe('10.0s');
	});
});

// ---------- resolveConfig ----------

describe('resolveConfig', () => {
	const origEnv = { ...process.env };

	afterEach(() => {
		process.env = { ...origEnv };
	});

	it('exits when no endpoint configured', () => {
		vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);
		vi.spyOn(console, 'error').mockImplementation(() => {});

		delete process.env['GATEKEEPER_URL'];
		delete process.env['GATEKEEPER_ADMIN_KEY'];
		delete process.env['GATEKEEPER_API_KEY'];

		resolveConfig({});
		expect(process.exit).toHaveBeenCalledWith(1);

		vi.restoreAllMocks();
	});

	it('prefers args over env vars', () => {
		process.env['GATEKEEPER_URL'] = 'https://env.example.com';
		process.env['GATEKEEPER_ADMIN_KEY'] = 'env-admin';
		process.env['GATEKEEPER_API_KEY'] = 'env-api';

		const config = resolveConfig({
			endpoint: 'https://arg.example.com',
			'admin-key': 'arg-admin',
			'api-key': 'arg-api',
		});
		expect(config.baseUrl).toBe('https://arg.example.com');
		expect(config.adminKey).toBe('arg-admin');
		expect(config.apiKey).toBe('arg-api');
	});

	it('falls back to env vars when args missing', () => {
		process.env['GATEKEEPER_URL'] = 'https://env.example.com';
		process.env['GATEKEEPER_ADMIN_KEY'] = 'env-admin';
		process.env['GATEKEEPER_API_KEY'] = 'env-api';

		const config = resolveConfig({});
		expect(config.baseUrl).toBe('https://env.example.com');
		expect(config.adminKey).toBe('env-admin');
		expect(config.apiKey).toBe('env-api');
	});

	it('strips trailing slashes from URL', () => {
		const config = resolveConfig({
			endpoint: 'https://example.com///',
		});
		expect(config.baseUrl).toBe('https://example.com');
	});
});

// ---------- resolveZoneId ----------

describe('resolveZoneId', () => {
	const origEnv = { ...process.env };
	beforeEach(() => {
		vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);
		vi.spyOn(console, 'error').mockImplementation(() => {});
	});

	afterEach(() => {
		process.env = { ...origEnv };
		vi.restoreAllMocks();
	});

	it('uses --zone-id arg', () => {
		const zoneId = resolveZoneId({ 'zone-id': 'abc123' });
		expect(zoneId).toBe('abc123');
		expect(process.exit).not.toHaveBeenCalled();
	});

	it('falls back to env var', () => {
		process.env['GATEKEEPER_ZONE_ID'] = 'env-zone';
		const zoneId = resolveZoneId({});
		expect(zoneId).toBe('env-zone');
		expect(process.exit).not.toHaveBeenCalled();
	});

	it('prefers arg over env', () => {
		process.env['GATEKEEPER_ZONE_ID'] = 'env-zone';
		const zoneId = resolveZoneId({ 'zone-id': 'arg-zone' });
		expect(zoneId).toBe('arg-zone');
	});

	it('exits when neither arg nor env set', () => {
		delete process.env['GATEKEEPER_ZONE_ID'];
		resolveZoneId({});
		expect(process.exit).toHaveBeenCalledWith(1);
	});
});
