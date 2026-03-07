/** Factory for generating bulk subcommands (bulk-revoke, bulk-delete) to avoid duplication across entity types. */

import { defineCommand } from 'citty';
import { resolveConfig, request, assertOk } from './client.js';
import { success, info, warn, error, bold, dim, cyan, green, red, yellow, table, printJson, formatDuration } from './ui.js';
import { baseArgs } from './shared-args.js';

// ─── Types ──────────────────────────────────────────────────────────────────

interface BulkSubcommandConfig {
	/** Human-readable entity name for messages, e.g. "keys", "credentials", "endpoints". */
	entityName: string;
	/** API path for the bulk operation, e.g. "/admin/keys/bulk-revoke". */
	apiPath: string;
	/** Field name in the request body for the ID array, e.g. "ids", "access_key_ids". */
	idField: string;
	/** The action verb, e.g. "revoke", "delete". */
	action: string;
	/** Field used for display in ID descriptions, e.g. "gw_...", "GK...". Defaults to generic "IDs". */
	displayField?: string;
	/** Extra args to spread into the command definition (e.g. zoneArgs). */
	extraArgs?: Record<string, unknown>;
}

// ─── Bulk status color helpers ──────────────────────────────────────────────

function colorStatus(status: string, action: string): string {
	if (status === action + 'd' || status === action.replace(/e$/, 'ed')) return green(status);
	if (status === 'not_found') return red(status);
	return yellow(status);
}

function colorDeleteStatus(status: string): string {
	if (status === 'deleted') return green(status);
	return red(status);
}

// ─── Factory ────────────────────────────────────────────────────────────────

/** Create a citty subcommand definition for a bulk operation (revoke or delete). */
export function makeBulkSubcommand(config: BulkSubcommandConfig) {
	const { entityName, apiPath, idField, action, displayField } = config;
	const idDesc = displayField ?? 'IDs';
	const isDelete = action === 'delete';

	return defineCommand({
		meta: {
			name: `bulk-${action}`,
			description: `Bulk ${action} multiple ${entityName}`,
		},
		args: {
			...baseArgs,
			...(config.extraArgs ?? {}),
			ids: {
				type: 'string',
				description: `Comma-separated list of ${idDesc}`,
				required: true,
			},
			confirm: {
				type: 'boolean',
				description: 'Execute the operation (without this flag, runs in dry-run mode)',
			},
		},
		async run({ args }) {
			const config = resolveConfig(args);
			const ids = (args as Record<string, unknown> & { ids: string }).ids
				.split(',')
				.map((s: string) => s.trim())
				.filter(Boolean);

			if (ids.length === 0) {
				error(`No ${entityName} IDs provided`);
				process.exit(1);
			}

			const body: Record<string, unknown> = {
				[idField]: ids,
				confirm_count: ids.length,
				dry_run: !(args as Record<string, unknown> & { confirm?: boolean }).confirm,
			};

			const isConfirm = !!(args as Record<string, unknown> & { confirm?: boolean }).confirm;

			const { status, data, durationMs } = await request(config, 'POST', apiPath, {
				body,
				auth: 'admin',
				label: isConfirm
					? `Bulk ${action.endsWith('e') ? action.slice(0, -1) : action}ing ${entityName}...`
					: `Previewing bulk ${action} (dry run)...`,
			});

			if ((args as Record<string, unknown> & { json?: boolean }).json) {
				assertOk(status, data);
				printJson(data);
				return;
			}

			assertOk(status, data);
			const result = (data as Record<string, unknown>).result as Record<string, unknown>;

			console.error('');
			if (result.dry_run) {
				warn(`Dry run \u2014 no changes made ${dim(`(${formatDuration(durationMs)})`)}`);
				console.error('');
				const items = result.items as { id: string; current_status: string; would_become: string }[];
				const rows = items.map((i) => [cyan(i.id), i.current_status, yellow(i.would_become)]);
				table(['ID', 'Current Status', 'Would Become'], rows);
				console.error('');
				info(`Re-run with ${bold('--confirm')} to execute.`);
			} else {
				success(`Bulk ${action} complete ${dim(`(${formatDuration(durationMs)})`)}`);
				console.error('');
				const results = result.results as { id: string; status: string }[];
				const rows = results.map((r) => {
					const statusLabel = isDelete ? colorDeleteStatus(r.status) : colorStatus(r.status, action);
					return [cyan(r.id), statusLabel];
				});
				table(['ID', 'Status'], rows);
			}
			console.error('');
		},
	});
}
