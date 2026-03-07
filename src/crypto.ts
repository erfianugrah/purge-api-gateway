/**
 * Shared cryptographic utilities.
 * Used by admin auth (timing-safe key comparison) and S3 Sig V4 verification.
 */

/**
 * Constant-time string comparison using HMAC-SHA256.
 * Prevents timing attacks by comparing fixed-length MACs instead of raw strings.
 */
export async function timingSafeEqual(a: string, b: string): Promise<boolean> {
	const encoder = new TextEncoder();
	const hmacKey = await crypto.subtle.importKey(
		'raw',
		encoder.encode('gatekeeper-admin-compare'),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign'],
	);
	const [macA, macB] = await Promise.all([
		crypto.subtle.sign('HMAC', hmacKey, encoder.encode(a)),
		crypto.subtle.sign('HMAC', hmacKey, encoder.encode(b)),
	]);
	// timingSafeEqual is a Workers runtime extension to SubtleCrypto — not in standard TS lib types
	return (crypto.subtle as SubtleCrypto & { timingSafeEqual(a: ArrayBuffer, b: ArrayBuffer): boolean }).timingSafeEqual(macA, macB);
}

/** Generate a short random flight identifier (8 hex chars). */
export function generateFlightId(): string {
	const bytes = new Uint8Array(4);
	crypto.getRandomValues(bytes);
	return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
