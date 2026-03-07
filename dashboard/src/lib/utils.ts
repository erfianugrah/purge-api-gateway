import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

/** Safely copy text to the clipboard, logging on failure. */
export async function copyToClipboard(text: string): Promise<boolean> {
	try {
		await navigator.clipboard.writeText(text);
		return true;
	} catch (e: any) {
		console.error('Clipboard write failed:', e);
		return false;
	}
}

// ─── Centralized Color Map ───────────────────────────────────────────
// Lovelace palette — used across charts, badges, and stat cards.

export const STATUS_COLORS = {
	success: '#5adecd', // green — 200 OK
	error: '#f37e96', // red-pink — 4xx/5xx errors
	rate_limited: '#f1a171', // peach — 429
	collapsed: '#8796f4', // blue — collapsed requests
	denied: '#ff4870', // bright red — 403 forbidden
} as const;

export const PURGE_TYPE_COLORS = {
	url: '#c574dd', // purple — single-file purge by URL
	host: '#79e6f3', // cyan — purge by host
	tag: '#5adecd', // green — purge by cache tag
	prefix: '#f1a171', // peach — purge by prefix
	everything: '#f37e96', // red — purge everything
} as const;

// S3 operation category colors
export const S3_OP_COLORS = {
	read: '#5adecd', // green — GetObject, HeadObject, etc.
	write: '#c574dd', // purple — PutObject, DeleteObject, etc.
	list: '#79e6f3', // cyan — ListBuckets, ListObjectsV2, etc.
	other: '#8796f4', // blue — everything else
} as const;

// Palette for pie/bar chart series (cycles for arbitrary-length data)
export const CHART_PALETTE = ['#5adecd', '#c574dd', '#79e6f3', '#f1a171', '#8796f4', '#f37e96', '#ffd866', '#ff4870'] as const;

// Shared chart tooltip styling (Lovelace theme)
export const CHART_TOOLTIP_STYLE = {
	contentStyle: {
		backgroundColor: '#282a36',
		border: '1px solid #414457',
		borderRadius: '8px',
		fontSize: '12px',
		color: '#fcfcfc',
	},
	itemStyle: { color: '#fcfcfc' },
	labelStyle: { color: '#bdbdc1' },
};
