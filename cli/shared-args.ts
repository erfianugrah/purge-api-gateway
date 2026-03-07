/** Shared CLI argument definitions to avoid duplication across command files. */

/** Base args: endpoint + admin-key + json (used by most admin commands). */
export const baseArgs = {
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

/** Admin args with zone-id: endpoint + admin-key + zone-id + json. */
export const zoneArgs = {
	...baseArgs,
	'zone-id': {
		type: 'string' as const,
		alias: ['z'] as string[],
		description: 'Cloudflare zone ID ($GATEKEEPER_ZONE_ID)',
	},
};

/** Force flag for destructive operations. */
export const forceArg = {
	force: {
		type: 'boolean' as const,
		alias: ['f'] as string[],
		description: 'Skip confirmation prompt',
	},
};
