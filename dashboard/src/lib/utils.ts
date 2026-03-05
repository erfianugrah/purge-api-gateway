import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

// ─── Centralized Color Map ───────────────────────────────────────────
// Lovelace palette — used across charts, badges, and stat cards.

export const STATUS_COLORS = {
	success: "#5adecd", // green — 200 OK
	error: "#f37e96", // red-pink — 4xx/5xx errors
	rate_limited: "#f1a171", // peach — 429
	collapsed: "#8796f4", // blue — collapsed requests
	denied: "#ff4870", // bright red — 403 forbidden
} as const;

export const PURGE_TYPE_COLORS = {
	single: "#c574dd", // purple — single-file purge
	bulk: "#79e6f3", // cyan — bulk purge
} as const;

// Shared chart tooltip styling (Lovelace theme)
export const CHART_TOOLTIP_STYLE = {
	contentStyle: {
		backgroundColor: "#282a36",
		border: "1px solid #414457",
		borderRadius: "8px",
		fontSize: "12px",
		color: "#fcfcfc",
	},
	itemStyle: { color: "#fcfcfc" },
	labelStyle: { color: "#bdbdc1" },
};
