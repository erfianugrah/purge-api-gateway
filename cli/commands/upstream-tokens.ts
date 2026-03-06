import { defineCommand } from 'citty';
import { resolveConfig, request, assertOk } from '../client.js';
import { success, info, warn, error, bold, dim, cyan, green, red, yellow, table, label, printJson, formatDuration } from '../ui.js';

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
	},
	async run({ args }) {
		const config = resolveConfig(args);

		const { status, data, durationMs } = await request(config, 'GET', '/admin/upstream-tokens', {
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
			const created = new Date(t.created_at as number).toISOString().slice(0, 19).replace('T', ' ');
			const zones = t.zone_ids as string;

			return [cyan(t.id as string), t.name as string, zones, created];
		});

		table(['ID', 'Name', 'Zone IDs', 'Created'], rows);
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

// --- upstream-tokens delete ---
const del = defineCommand({
	meta: { name: 'delete', description: 'Delete an upstream token (permanent, irreversible)' },
	args: {
		...globalArgs,
		id: {
			type: 'string',
			description: 'The upstream token ID to delete (upt_...)',
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
			warn(`You are about to delete upstream token ${bold(tokenId)}. This cannot be undone.`);
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
			label: 'Deleting upstream token...',
		});

		if (args.json) {
			assertOk(status, data);
			printJson(data);
			return;
		}

		assertOk(status, data);
		console.error('');
		success(`Upstream token ${bold(tokenId)} deleted ${dim(`(${formatDuration(durationMs)})`)}`);
		console.error('');
	},
});

// --- upstream-tokens bulk-delete ---
const bulkDelete = defineCommand({
	meta: { name: 'bulk-delete', description: 'Bulk permanently delete multiple upstream tokens' },
	args: {
		...globalArgs,
		ids: {
			type: 'string',
			description: 'Comma-separated list of token IDs (upt_...)',
			required: true,
		},
		confirm: {
			type: 'boolean',
			description: 'Execute the operation (without this flag, runs in dry-run mode)',
		},
	},
	async run({ args }) {
		const config = resolveConfig(args);
		const ids = args.ids
			.split(',')
			.map((s: string) => s.trim())
			.filter(Boolean);

		if (ids.length === 0) {
			error('No token IDs provided');
			process.exit(1);
		}

		const body: Record<string, unknown> = {
			ids,
			confirm_count: ids.length,
			dry_run: !args.confirm,
		};

		const { status, data, durationMs } = await request(config, 'POST', '/admin/upstream-tokens/bulk-delete', {
			body,
			auth: 'admin',
			label: args.confirm ? 'Bulk deleting upstream tokens...' : 'Previewing bulk delete (dry run)...',
		});

		if (args.json) {
			assertOk(status, data);
			printJson(data);
			return;
		}

		assertOk(status, data);
		const result = (data as Record<string, unknown>).result as Record<string, unknown>;

		console.error('');
		if (result.dry_run) {
			warn(`Dry run — no changes made ${dim(`(${formatDuration(durationMs)})`)}`);
			console.error('');
			const items = result.items as { id: string; current_status: string; would_become: string }[];
			const rows = items.map((i) => [cyan(i.id), i.current_status, yellow(i.would_become)]);
			table(['ID', 'Current Status', 'Would Become'], rows);
			console.error('');
			info(`Re-run with ${bold('--confirm')} to execute.`);
		} else {
			success(`Bulk delete complete ${dim(`(${formatDuration(durationMs)})`)}`);
			console.error('');
			const results = result.results as { id: string; status: string }[];
			const rows = results.map((r) => {
				const statusLabel = r.status === 'deleted' ? green(r.status) : red(r.status);
				return [cyan(r.id), statusLabel];
			});
			table(['ID', 'Status'], rows);
		}
		console.error('');
	},
});

// --- Formatting helper ---

function formatUpstreamToken(token: Record<string, unknown>): void {
	label('ID', bold(token.id as string));
	label('Name', token.name as string);
	label('Token preview', dim(token.token_preview as string));
	label('Zone IDs', token.zone_ids as string);
	label('Created', new Date(token.created_at as number).toISOString());
	if (token.created_by) {
		label('Created by', token.created_by as string);
	}
}

// --- upstream-tokens (parent) ---
export default defineCommand({
	meta: { name: 'upstream-tokens', description: 'Manage upstream Cloudflare API tokens for purge' },
	subCommands: { create, list, get, delete: del, 'bulk-delete': bulkDelete },
});
