import { defineCommand } from 'citty';
import { resolveConfig, request, assertOk } from '../client.js';
import {
	success,
	info,
	warn,
	error,
	bold,
	dim,
	cyan,
	green,
	red,
	yellow,
	table,
	label,
	printJson,
	formatDuration,
	symbols,
} from '../ui.js';

/** Shared args across upstream-tokens commands. */
const globalArgs = {
	endpoint: {
		type: 'string' as const,
		description: 'Gateway URL ($GATEKEEPER_URL)',
	},
	'admin-key': {
		type: 'string' as const,
		description: 'Admin key ($GATEKEEPER_ADMIN_KEY)',
	},
	json: {
		type: 'boolean' as const,
		description: 'Output raw JSON',
	},
};

// --- upstream-tokens create ---
const create = defineCommand({
	meta: {
		name: 'create',
		description: 'Register a Cloudflare API token for upstream purge requests',
	},
	args: {
		...globalArgs,
		name: {
			type: 'string',
			description: 'Human-readable name for this token',
			required: true,
		},
		token: {
			type: 'string',
			description: 'Cloudflare API token value ($UPSTREAM_CF_TOKEN)',
		},
		'zone-ids': {
			type: 'string',
			description: 'Comma-separated zone IDs this token covers, or "*" for all',
			required: true,
		},
	},
	async run({ args }) {
		const config = resolveConfig(args);

		const tokenValue = args.token || process.env['UPSTREAM_CF_TOKEN'];
		if (!tokenValue) {
			error('Token required. Set --token or UPSTREAM_CF_TOKEN env var.');
			process.exit(1);
		}

		const zoneIds = args['zone-ids'] === '*' ? ['*'] : args['zone-ids'].split(',').map((s) => s.trim());

		const body = {
			name: args.name,
			token: tokenValue,
			zone_ids: zoneIds,
		};

		const { status, data, durationMs } = await request(config, 'POST', '/admin/upstream-tokens', {
			body,
			auth: 'admin',
			label: 'Registering upstream token...',
		});

		if (args.json) {
			assertOk(status, data);
			printJson(data);
			return;
		}

		assertOk(status, data);
		const result = (data as Record<string, unknown>).result as Record<string, unknown>;

		console.error('');
		success(`Upstream token registered ${dim(`(${formatDuration(durationMs)})`)}`);
		console.error('');
		formatUpstreamToken(result);
		console.error('');
		warn('The token value is stored write-only and cannot be retrieved again.');
		console.error('');
	},
});

// --- upstream-tokens list ---
const list = defineCommand({
	meta: { name: 'list', description: 'List all registered upstream tokens' },
	args: {
		...globalArgs,
		'active-only': {
			type: 'boolean',
			description: 'Only show active (non-revoked) tokens',
		},
	},
	async run({ args }) {
		const config = resolveConfig(args);

		const statusFilter = args['active-only'] ? '?status=active' : '';
		const { status, data, durationMs } = await request(config, 'GET', `/admin/upstream-tokens${statusFilter}`, {
			auth: 'admin',
			label: 'Fetching upstream tokens...',
		});

		if (args.json) {
			assertOk(status, data);
			printJson(data);
			return;
		}

		assertOk(status, data);
		const result = (data as Record<string, unknown>).result as Record<string, unknown>[];

		if (result.length === 0) {
			info('No upstream tokens found.');
			return;
		}

		console.error('');
		info(`${bold(String(result.length))} token${result.length === 1 ? '' : 's'} found ${dim(`(${formatDuration(durationMs)})`)}`);
		console.error('');

		const rows = result.map((t) => {
			const statusLabel = (t.revoked as number) === 1 ? red('revoked') : green('active');
			const created = new Date(t.created_at as number).toISOString().slice(0, 19).replace('T', ' ');
			const zones = t.zone_ids as string;

			return [cyan(t.id as string), t.name as string, zones, statusLabel, created];
		});

		table(['ID', 'Name', 'Zone IDs', 'Status', 'Created'], rows);
		console.error('');
	},
});

// --- upstream-tokens get ---
const get = defineCommand({
	meta: { name: 'get', description: 'Get details of an upstream token' },
	args: {
		...globalArgs,
		id: {
			type: 'string',
			description: 'The upstream token ID (upt_...)',
			required: true,
		},
	},
	async run({ args }) {
		const config = resolveConfig(args);

		const { status, data, durationMs } = await request(config, 'GET', `/admin/upstream-tokens/${encodeURIComponent(args.id)}`, {
			auth: 'admin',
			label: 'Fetching upstream token...',
		});

		if (args.json) {
			assertOk(status, data);
			printJson(data);
			return;
		}

		assertOk(status, data);
		const result = (data as Record<string, unknown>).result as Record<string, unknown>;

		console.error('');
		formatUpstreamToken(result);
		console.error('');
	},
});

// --- upstream-tokens revoke ---
const revoke = defineCommand({
	meta: { name: 'revoke', description: 'Revoke an upstream token (irreversible)' },
	args: {
		...globalArgs,
		id: {
			type: 'string',
			description: 'The upstream token ID to revoke (upt_...)',
			required: true,
		},
		force: {
			type: 'boolean',
			alias: ['f'],
			description: 'Skip confirmation prompt',
		},
	},
	async run({ args }) {
		const config = resolveConfig(args);
		const tokenId = args.id;

		if (!args.force && process.stdin.isTTY) {
			warn(`You are about to revoke upstream token ${bold(tokenId)}. This cannot be undone.`);
			process.stderr.write(`  Continue? [y/N] `);

			const confirmed = await new Promise<boolean>((resolve) => {
				process.stdin.setRawMode?.(true);
				process.stdin.resume();
				process.stdin.once('data', (chunk) => {
					process.stdin.setRawMode?.(false);
					process.stdin.pause();
					const char = chunk.toString().trim().toLowerCase();
					process.stderr.write(char + '\n');
					resolve(char === 'y');
				});
			});

			if (!confirmed) {
				info('Aborted.');
				return;
			}
		}

		const { status, data, durationMs } = await request(config, 'DELETE', `/admin/upstream-tokens/${encodeURIComponent(tokenId)}`, {
			auth: 'admin',
			label: 'Revoking upstream token...',
		});

		if (args.json) {
			assertOk(status, data);
			printJson(data);
			return;
		}

		assertOk(status, data);
		console.error('');
		success(`Upstream token ${bold(tokenId)} revoked ${dim(`(${formatDuration(durationMs)})`)}`);
		console.error('');
	},
});

// --- Formatting helper ---

function formatUpstreamToken(token: Record<string, unknown>): void {
	const status = (token.revoked as number) === 1 ? red('revoked') : green('active');

	label('ID', bold(token.id as string));
	label('Name', token.name as string);
	label('Token preview', dim(token.token_preview as string));
	label('Zone IDs', token.zone_ids as string);
	label('Status', status);
	label('Created', new Date(token.created_at as number).toISOString());
	if (token.created_by) {
		label('Created by', token.created_by as string);
	}
}

// --- upstream-tokens (parent) ---
export default defineCommand({
	meta: { name: 'upstream-tokens', description: 'Manage upstream Cloudflare API tokens for purge' },
	subCommands: { create, list, get, revoke },
});
