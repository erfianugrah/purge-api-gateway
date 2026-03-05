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
			description: 'R2 secret access key',
			required: true,
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

		const bucketNames = args['bucket-names'] === '*' ? ['*'] : args['bucket-names'].split(',').map((s) => s.trim());

		const body = {
			name: args.name,
			access_key_id: args['access-key-id'],
			secret_access_key: args['secret-access-key'],
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
		'active-only': {
			type: 'boolean',
			description: 'Only show active (non-revoked) endpoints',
		},
	},
	async run({ args }) {
		const config = resolveConfig(args);

		const statusFilter = args['active-only'] ? '?status=active' : '';
		const { status, data, durationMs } = await request(config, 'GET', `/admin/upstream-r2${statusFilter}`, {
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
			const statusLabel = (ep.revoked as number) === 1 ? red('revoked') : green('active');
			const created = new Date(ep.created_at as number).toISOString().slice(0, 19).replace('T', ' ');
			const buckets = ep.bucket_names as string;

			return [cyan(ep.id as string), ep.name as string, buckets, statusLabel, created];
		});

		table(['ID', 'Name', 'Buckets', 'Status', 'Created'], rows);
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

// --- upstream-r2 revoke ---
const revoke = defineCommand({
	meta: { name: 'revoke', description: 'Revoke an R2 endpoint registration (irreversible)' },
	args: {
		...globalArgs,
		id: {
			type: 'string',
			description: 'The R2 endpoint ID to revoke (upr2_...)',
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
			warn(`You are about to revoke R2 endpoint ${bold(endpointId)}. This cannot be undone.`);
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
			label: 'Revoking R2 endpoint...',
		});

		if (args.json) {
			assertOk(status, data);
			printJson(data);
			return;
		}

		assertOk(status, data);
		console.error('');
		success(`R2 endpoint ${bold(endpointId)} revoked ${dim(`(${formatDuration(durationMs)})`)}`);
		console.error('');
	},
});

// --- Formatting helper ---

function formatUpstreamR2(ep: Record<string, unknown>): void {
	const status = (ep.revoked as number) === 1 ? red('revoked') : green('active');

	label('ID', bold(ep.id as string));
	label('Name', ep.name as string);
	label('Access key preview', dim(ep.access_key_preview as string));
	label('Endpoint', ep.endpoint as string);
	label('Bucket names', ep.bucket_names as string);
	label('Status', status);
	label('Created', new Date(ep.created_at as number).toISOString());
	if (ep.created_by) {
		label('Created by', ep.created_by as string);
	}
}

// --- upstream-r2 (parent) ---
export default defineCommand({
	meta: { name: 'upstream-r2', description: 'Manage upstream R2 endpoints for S3 proxy' },
	subCommands: { create, list, get, revoke },
});
