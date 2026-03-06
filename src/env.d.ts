/** Secrets set via `wrangler secret put` — not in wrangler.jsonc vars. */
declare namespace Cloudflare {
	interface Env {
		ADMIN_KEY: string;
		/** Cloudflare Access team name (e.g. "myteam" for myteam.cloudflareaccess.com) */
		CF_ACCESS_TEAM_NAME: string;
		/** Cloudflare Access Application Audience (AUD) tag */
		CF_ACCESS_AUD: string;
	}
}
