import { defineCommand } from 'citty';
import { resolveConfig, request, assertOk } from '../client.js';
import { success, info, warn, error, bold, dim, cyan, green, yellow, table, label, printJson, formatDuration } from '../ui.js';

/** Shared args across config commands. */
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

// --- config get ---
const get = defineCommand({
	meta: { name: 'get', description: 'Show the full resolved config with overrides and defaults' },
	args: { ...globalArgs },
	async run({ args }) {
		const cfg = resolveConfig(args);

		const { status, data, durationMs } = await request(cfg, 'GET', '/admin/config', {
			auth: 'admin',
			label: 'Fetching config...',
		});

		if (args.json) {
			assertOk(status, data);
			printJson(data);
			return;
		}

		assertOk(status, data);
		const result = (data as Record<string, unknown>).result as Record<string, unknown>;
		const config = result.config as Record<string, number>;
		const overrides = result.overrides as Array<Record<string, unknown>>;
		const defaults = result.defaults as Record<string, number>;

		console.error('');
		info(`Config resolved ${dim(`(${formatDuration(durationMs)})`)}`);
		console.error('');

		const overrideKeys = new Set(overrides.map((o) => o.key as string));

		const rows = Object.entries(config).map(([key, value]) => {
			const isOverride = overrideKeys.has(key);
			const defaultVal = defaults[key];
			const source = isOverride ? green('registry') : defaultVal === value ? dim('default') : yellow('env');
			return [cyan(key), String(value), source, String(defaultVal)];
		});

		table(['Key', 'Value', 'Source', 'Default'], rows);

		if (overrides.length > 0) {
			console.error('');
			info(`${bold(String(overrides.length))} override${overrides.length === 1 ? '' : 's'} in registry`);
		}
		console.error('');
	},
});

// --- config set ---
const set = defineCommand({
	meta: { name: 'set', description: 'Set one or more config values (key=value pairs)' },
	args: {
		...globalArgs,
		_: {
			type: 'positional' as const,
			description: 'Config key=value pairs (e.g. bulk_rate=100 single_rate=5000)',
			required: true,
		},
	},
	async run({ args }) {
		const cfg = resolveConfig(args);

		// Parse key=value pairs from positional args
		const rawPairs = (args._ as unknown as string) || '';
		const pairs = rawPairs
			.split(/\s+/)
			.filter(Boolean)
			.map((pair: string) => {
				const eqIdx = pair.indexOf('=');
				if (eqIdx === -1) {
					error(`Invalid format: "${pair}". Use key=value.`);
					process.exit(1);
				}
				return {
					key: pair.slice(0, eqIdx),
					value: Number(pair.slice(eqIdx + 1)),
				};
			});

		if (pairs.length === 0) {
			error('No key=value pairs provided. Usage: config set bulk_rate=100 single_rate=5000');
			process.exit(1);
		}

		const updates: Record<string, number> = {};
		for (const { key, value } of pairs) {
			if (isNaN(value) || value <= 0) {
				error(`Invalid value for "${key}": must be a positive number`);
				process.exit(1);
			}
			updates[key] = value;
		}

		const { status, data, durationMs } = await request(cfg, 'PUT', '/admin/config', {
			body: updates,
			auth: 'admin',
			label: 'Updating config...',
		});

		if (args.json) {
			assertOk(status, data);
			printJson(data);
			return;
		}

		assertOk(status, data);
		console.error('');
		success(`Config updated ${dim(`(${formatDuration(durationMs)})`)}`);
		console.error('');

		const result = (data as Record<string, unknown>).result as Record<string, unknown>;
		const config = result.config as Record<string, number>;

		for (const [key, value] of Object.entries(updates)) {
			label(key, `${bold(String(value))} ${dim(`(was → now ${config[key]})`)} `);
		}
		console.error('');
	},
});

// --- config reset ---
const reset = defineCommand({
	meta: { name: 'reset', description: 'Reset a config key to its env/default value' },
	args: {
		...globalArgs,
		key: {
			type: 'string',
			description: 'The config key to reset',
			required: true,
		},
	},
	async run({ args }) {
		const cfg = resolveConfig(args);

		const { status, data, durationMs } = await request(cfg, 'DELETE', `/admin/config/${encodeURIComponent(args.key)}`, {
			auth: 'admin',
			label: 'Resetting config key...',
		});

		if (args.json) {
			assertOk(status, data);
			printJson(data);
			return;
		}

		assertOk(status, data);
		console.error('');
		success(`Config key ${bold(args.key)} reset to default ${dim(`(${formatDuration(durationMs)})`)}`);
		console.error('');
	},
});

// --- config (parent) ---
export default defineCommand({
	meta: { name: 'config', description: 'Manage gateway configuration (rate limits, cache TTLs, etc.)' },
	subCommands: { get, set, reset },
});
