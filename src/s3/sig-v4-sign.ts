import { AwsClient } from 'aws4fetch';
import type { R2Credentials } from './upstream-r2';

// ─── Outbound re-signing ────────────────────────────────────────────────────
// Uses aws4fetch to re-sign requests with resolved R2 credentials.

/** Lazily-initialized AwsClient instances keyed by access_key_id. Bounded to prevent unbounded growth. */
const MAX_CLIENT_CACHE_SIZE = 64;
const CLIENT_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes — ensures rotated R2 credentials take effect
const clientCache = new Map<string, { client: AwsClient; cachedAt: number }>();

/** Get or create the AwsClient for a given set of R2 credentials. */
function getClient(creds: R2Credentials): AwsClient {
	const existing = clientCache.get(creds.accessKeyId);
	if (existing && Date.now() - existing.cachedAt < CLIENT_CACHE_TTL_MS) {
		return existing.client;
	}

	// Evict oldest entry if cache is full
	if (clientCache.size >= MAX_CLIENT_CACHE_SIZE) {
		const oldest = clientCache.keys().next().value!;
		clientCache.delete(oldest);
	}

	const client = new AwsClient({
		accessKeyId: creds.accessKeyId,
		secretAccessKey: creds.secretAccessKey,
		service: 's3',
		region: 'auto',
	});
	clientCache.set(creds.accessKeyId, { client, cachedAt: Date.now() });
	return client;
}

/**
 * Query params to strip from the inbound request before forwarding to R2.
 * These are presigned URL authentication params — we re-sign with our own R2 credentials.
 */
const STRIP_QUERY_PARAMS = new Set([
	'X-Amz-Algorithm',
	'X-Amz-Credential',
	'X-Amz-Date',
	'X-Amz-Expires',
	'X-Amz-SignedHeaders',
	'X-Amz-Signature',
	'X-Amz-Security-Token',
	// SDK internal param — not needed by R2
	'x-id',
]);

/**
 * Headers to strip from the inbound request before forwarding to R2.
 * These are either hop-by-hop, Cloudflare-specific, or would conflict with re-signing.
 */
const STRIP_HEADERS = new Set([
	'authorization',
	'x-amz-date',
	'x-amz-content-sha256',
	'x-amz-security-token',
	'host',
	'cf-connecting-ip',
	'cf-ray',
	'cf-visitor',
	'cf-worker',
	'cf-ipcountry',
	'cf-access-jwt-assertion',
	'cf-access-authenticated-user-email',
	'connection',
	'keep-alive',
	'transfer-encoding',
	'x-forwarded-proto',
	'x-real-ip',
	// SDK-specific headers that R2 doesn't understand
	'amz-sdk-invocation-id',
	'amz-sdk-request',
]);

/**
 * Re-sign a request for R2 and forward it.
 *
 * - Strips the /s3 prefix from the path
 * - Copies safe headers from the inbound request
 * - Streams the body without buffering (unless bodyOverride is provided)
 * - Returns the R2 response
 *
 * @param bodyOverride - If provided, used instead of request.body (for cases where
 *   the body was already consumed, e.g. DeleteObjects XML parsing).
 */
export async function forwardToR2(request: Request, s3Path: string, creds: R2Credentials, bodyOverride?: string): Promise<Response> {
	const client = getClient(creds);

	// Build the R2 URL: endpoint + path (without /s3 prefix)
	const r2Url = new URL(s3Path, creds.endpoint);

	// Copy query params from original request — strip presigned URL auth params
	const inboundUrl = new URL(request.url);
	inboundUrl.searchParams.forEach((value, key) => {
		if (!STRIP_QUERY_PARAMS.has(key)) {
			r2Url.searchParams.set(key, value);
		}
	});

	// Copy safe headers
	const forwardHeaders = new Headers();
	request.headers.forEach((value, name) => {
		if (!STRIP_HEADERS.has(name.toLowerCase())) {
			forwardHeaders.set(name, value);
		}
	});

	// Use UNSIGNED-PAYLOAD for streaming — R2 supports it
	forwardHeaders.set('x-amz-content-sha256', 'UNSIGNED-PAYLOAD');

	// Determine body — use override if provided, otherwise stream from request
	let body: ReadableStream | string | undefined;
	if (bodyOverride !== undefined) {
		body = bodyOverride;
	} else {
		const hasBody = request.method !== 'GET' && request.method !== 'HEAD' && request.method !== 'DELETE';
		body = hasBody ? (request.body ?? undefined) : undefined;
	}

	// Sign and send
	const signed = await client.sign(r2Url.toString(), {
		method: request.method,
		headers: forwardHeaders,
		body,
	});

	return fetch(signed);
}
