import { defineCommand } from 'citty';
import { resolveConfig, request, assertOk } from '../client.js';
import { success, info, warn, error, bold, dim, cyan, green, red, yellow, table, label, printJson, formatDuration } from '../ui.js';

/** Shared args across upstream-r2 commands. */
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

// --- upstream-r2 create ---
const create = defineCommand({
	meta: {
		name: 'create',
		description: 'Register an R2 endpoint with credentials for S3 proxy forwarding',
	},
	args: {
		...globalArgs,
		name: {
			type: 'string',
			description: 'Human-readable name for this R2 endpoint',
			required: true,
		},
		'access-key-id': {
			type: 'string',
			description: 'R2 access key ID',
			required: true,
		},
		'secret-access-key': {
			type: 'string',
			description: 'R2 secret access key ($UPSTREAM_R2_SECRET_ACCESS_KEY)',
		},
		'r2-endpoint': {
			type: 'string',
			description: 'R2 endpoint URL (e.g. https://<account>.r2.cloudflarestorage.com)',
			required: true,
		},
		'bucket-names': {
			type: 'string',
			description: 'Comma-separated bucket names this endpoint covers, or "*" for all',
			required: true,
		},
	},
	async run({ args }) {
		const config = resolveConfig(args);

		const secretAccessKey = args['secret-access-key'] || process.env['UPSTREAM_R2_SECRET_ACCESS_KEY'];
		if (!secretAccessKey) {
			error('Secret access key required. Set --secret-access-key or UPSTREAM_R2_SECRET_ACCESS_KEY env var.');
			process.exit(1);
		}

		const bucketNames = args['bucket-names'] === '*' ? ['*'] : args['bucket-names'].split(',').map((s) => s.trim());

		const body = {
			name: args.name,
			access_key_id: args['access-key-id'],
			secret_access_key: secretAccessKey,
			endpoint: args['r2-endpoint'],
			bucket_names: bucketNames,
		};

		const { status, data, durationMs } = await request(config, 'POST', '/admin/upstream-r2', {
			body,
			auth: 'admin',
			label: 'Registering R2 endpoint...',
		});

		if (args.json) {
			assertOk(status, data);
			printJson(data);
			return;
		}

		assertOk(status, data);
		const result = (data as Record<string, unknown>).result as Record<string, unknown>;

		console.error('');
		success(`R2 endpoint registered ${dim(`(${formatDuration(durationMs)})`)}`);
		console.error('');
		formatUpstreamR2(result);
		console.error('');
		warn('The secret access key is stored write-only and cannot be retrieved again.');
		console.error('');
	},
});

// --- upstream-r2 list ---
const list = defineCommand({
	meta: { name: 'list', description: 'List all registered R2 endpoints' },
	args: {
		...globalArgs,
	},
	async run({ args }) {
		const config = resolveConfig(args);

		const { status, data, durationMs } = await request(config, 'GET', '/admin/upstream-r2', {
			auth: 'admin',
			label: 'Fetching R2 endpoints...',
		});

		if (args.json) {
			assertOk(status, data);
			printJson(data);
			return;
		}

		assertOk(status, data);
		const result = (data as Record<string, unknown>).result as Record<string, unknown>[];

		if (result.length === 0) {
			info('No R2 endpoints found.');
			return;
		}

		console.error('');
		info(`${bold(String(result.length))} endpoint${result.length === 1 ? '' : 's'} found ${dim(`(${formatDuration(durationMs)})`)}`);
		console.error('');

		const rows = result.map((ep) => {
			const created = new Date(ep.created_at as number).toISOString().slice(0, 19).replace('T', ' ');
			const buckets = ep.bucket_names as string;

			return [cyan(ep.id as string), ep.name as string, buckets, created];
		});

		table(['ID', 'Name', 'Buckets', 'Created'], rows);
		console.error('');
	},
});

// --- upstream-r2 get ---
const get = defineCommand({
	meta: { name: 'get', description: 'Get details of an R2 endpoint' },
	args: {
		...globalArgs,
		id: {
			type: 'string',
			description: 'The R2 endpoint ID (upr2_...)',
			required: true,
		},
	},
	async run({ args }) {
		const config = resolveConfig(args);

		const { status, data, durationMs } = await request(config, 'GET', `/admin/upstream-r2/${encodeURIComponent(args.id)}`, {
			auth: 'admin',
			label: 'Fetching R2 endpoint...',
		});

		if (args.json) {
			assertOk(status, data);
			printJson(data);
			return;
		}

		assertOk(status, data);
		const result = (data as Record<string, unknown>).result as Record<string, unknown>;

		console.error('');
		formatUpstreamR2(result);
		console.error('');
	},
});

// --- upstream-r2 delete ---
const del = defineCommand({
	meta: { name: 'delete', description: 'Delete an R2 endpoint registration (permanent, irreversible)' },
	args: {
		...globalArgs,
		id: {
			type: 'string',
			description: 'The R2 endpoint ID to delete (upr2_...)',
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
		const endpointId = args.id;

		if (!args.force && process.stdin.isTTY) {
			warn(`You are about to delete R2 endpoint ${bold(endpointId)}. This cannot be undone.`);
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

		const { status, data, durationMs } = await request(config, 'DELETE', `/admin/upstream-r2/${encodeURIComponent(endpointId)}`, {
			auth: 'admin',
			label: 'Deleting R2 endpoint...',
		});

		if (args.json) {
			assertOk(status, data);
			printJson(data);
			return;
		}

		assertOk(status, data);
		console.error('');
		success(`R2 endpoint ${bold(endpointId)} deleted ${dim(`(${formatDuration(durationMs)})`)}`);
		console.error('');
	},
});

// --- upstream-r2 bulk-delete ---
const bulkDelete = defineCommand({
	meta: { name: 'bulk-delete', description: 'Bulk permanently delete multiple R2 endpoints' },
	args: {
		...globalArgs,
		ids: {
			type: 'string',
			description: 'Comma-separated list of endpoint IDs (upr2_...)',
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
			error('No endpoint IDs provided');
			process.exit(1);
		}

		const body: Record<string, unknown> = {
			ids,
			confirm_count: ids.length,
			dry_run: !args.confirm,
		};

		const { status, data, durationMs } = await request(config, 'POST', '/admin/upstream-r2/bulk-delete', {
			body,
			auth: 'admin',
			label: args.confirm ? 'Bulk deleting R2 endpoints...' : 'Previewing bulk delete (dry run)...',
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

function formatUpstreamR2(ep: Record<string, unknown>): void {
	label('ID', bold(ep.id as string));
	label('Name', ep.name as string);
	label('Access key preview', dim(ep.access_key_preview as string));
	label('Endpoint', ep.endpoint as string);
	label('Bucket names', ep.bucket_names as string);
	label('Created', new Date(ep.created_at as number).toISOString());
	if (ep.created_by) {
		label('Created by', ep.created_by as string);
	}
}

// --- upstream-r2 (parent) ---
export default defineCommand({
	meta: { name: 'upstream-r2', description: 'Manage upstream R2 endpoints for S3 proxy' },
	subCommands: { create, list, get, delete: del, 'bulk-delete': bulkDelete },
});
