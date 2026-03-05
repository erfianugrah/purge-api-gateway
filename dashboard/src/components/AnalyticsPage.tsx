import { useState, useEffect, useCallback } from "react";
import { Clock, Cloud, HardDrive } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { getEvents, getS3Events } from "@/lib/api";
import type { PurgeEvent, S3Event } from "@/lib/api";
import { cn } from "@/lib/utils";
import { T } from "@/lib/typography";

// ─── Unified event type ─────────────────────────────────────────────

type UnifiedEvent = {
	id: number;
	source: "purge" | "s3";
	status: number;
	duration_ms: number;
	created_at: number;
	// Purge-specific
	key_id?: string;
	zone_id?: string;
	purge_type?: "single" | "bulk";
	cost?: number;
	collapsed?: string | null;
	// S3-specific
	credential_id?: string;
	operation?: string;
	bucket?: string | null;
	s3_key?: string | null;
};

function fromPurge(ev: PurgeEvent): UnifiedEvent {
	return {
		id: ev.id,
		source: "purge",
		status: ev.status,
		duration_ms: ev.duration_ms,
		created_at: ev.created_at,
		key_id: ev.key_id,
		zone_id: ev.zone_id,
		purge_type: ev.purge_type,
		cost: ev.cost,
		collapsed: ev.collapsed,
	};
}

function fromS3(ev: S3Event): UnifiedEvent {
	return {
		id: ev.id + 1_000_000_000, // offset to avoid collisions for React keys
		source: "s3",
		status: ev.status,
		duration_ms: ev.duration_ms,
		created_at: ev.created_at,
		credential_id: ev.credential_id,
		operation: ev.operation,
		bucket: ev.bucket,
		s3_key: ev.key,
	};
}

// ─── Helpers ────────────────────────────────────────────────────────

function formatTime(epoch: number): string {
	const d = new Date(epoch);
	return d.toLocaleString("en-US", {
		month: "short",
		day: "numeric",
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
		hour12: false,
	});
}

function truncateId(id: string, len = 10): string {
	return id.length > len ? `${id.slice(0, len)}...` : id;
}

function statusBadge(status: number): React.ReactNode {
	if (status >= 200 && status < 300) {
		return <Badge className="bg-lv-green/20 text-lv-green border-lv-green/30">{status}</Badge>;
	}
	if (status === 429) {
		return <Badge className="bg-lv-peach/20 text-lv-peach border-lv-peach/30">{status}</Badge>;
	}
	if (status === 403) {
		return <Badge className="bg-lv-red-bright/20 text-lv-red-bright border-lv-red-bright/30">{status}</Badge>;
	}
	if (status >= 400) {
		return <Badge className="bg-lv-red/20 text-lv-red border-lv-red/30">{status}</Badge>;
	}
	return <Badge variant="secondary">{status}</Badge>;
}

function sourceBadge(source: "purge" | "s3"): React.ReactNode {
	if (source === "purge") {
		return (
			<Badge className="bg-lv-purple/20 text-lv-purple border-lv-purple/30 gap-1">
				<Cloud className="h-3 w-3" />
				Purge
			</Badge>
		);
	}
	return (
		<Badge className="bg-lv-cyan/20 text-lv-cyan border-lv-cyan/30 gap-1">
			<HardDrive className="h-3 w-3" />
			S3
		</Badge>
	);
}

const LIMIT_OPTIONS = [50, 100, 500] as const;
type TabFilter = "all" | "purge" | "s3";

// ─── Loading Skeleton ───────────────────────────────────────────────

function EventsTableSkeleton() {
	return (
		<div className="space-y-2">
			{Array.from({ length: 8 }).map((_, i) => (
				<Skeleton key={i} className="h-9 w-full" />
			))}
		</div>
	);
}

// ─── Analytics Page ─────────────────────────────────────────────────

export function AnalyticsPage() {
	const [purgeEvents, setPurgeEvents] = useState<PurgeEvent[]>([]);
	const [s3Events, setS3Events] = useState<S3Event[]>([]);
	const [limit, setLimit] = useState<number>(100);
	const [tab, setTab] = useState<TabFilter>("all");
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const fetchData = useCallback(async (fetchLimit: number) => {
		setLoading(true);
		setError(null);
		try {
			const [purge, s3] = await Promise.all([
				getEvents({ limit: fetchLimit }).catch(() => [] as PurgeEvent[]),
				getS3Events({ limit: fetchLimit }).catch(() => [] as S3Event[]),
			]);
			setPurgeEvents(purge);
			setS3Events(s3);
		} catch (e: any) {
			setError(e.message ?? "Failed to load events");
			setPurgeEvents([]);
			setS3Events([]);
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		fetchData(limit);
	}, [fetchData, limit]);

	// ── Unified + filtered events ────────────────────────────────

	const allEvents: UnifiedEvent[] = [
		...purgeEvents.map(fromPurge),
		...s3Events.map(fromS3),
	].sort((a, b) => b.created_at - a.created_at);

	const filteredEvents =
		tab === "all"
			? allEvents
			: allEvents.filter((e) => e.source === tab);

	// ── Counts for tab labels ────────────────────────────────────

	const purgeCount = purgeEvents.length;
	const s3Count = s3Events.length;
	const totalCount = allEvents.length;

	return (
		<div className="space-y-6">
			{/* ── Controls ───────────────────────────────────────────── */}
			<div className="flex flex-wrap items-center gap-3">
				{/* Source tabs */}
				<div className="flex rounded-md border border-border">
					{(["all", "purge", "s3"] as TabFilter[]).map((t) => {
						const count = t === "all" ? totalCount : t === "purge" ? purgeCount : s3Count;
						const labels: Record<TabFilter, string> = { all: "All", purge: "Purge", s3: "S3" };
						return (
							<button
								key={t}
								onClick={() => setTab(t)}
								className={cn(
									"px-3 py-1 text-xs font-data transition-colors",
									tab === t
										? "bg-lv-purple/20 text-lv-purple"
										: "text-muted-foreground hover:text-foreground hover:bg-muted",
									t !== "all" && "border-l border-border",
								)}
							>
								{labels[t]} ({count})
							</button>
						);
					})}
				</div>

				{/* Limit selector */}
				<div className="ml-auto flex items-center gap-2">
					<span className={T.formLabel}>Limit</span>
					<div className="flex rounded-md border border-border">
						{LIMIT_OPTIONS.map((opt) => (
							<button
								key={opt}
								onClick={() => setLimit(opt)}
								className={cn(
									"px-3 py-1 text-xs font-data transition-colors",
									limit === opt
										? "bg-lv-purple/20 text-lv-purple"
										: "text-muted-foreground hover:text-foreground hover:bg-muted",
									opt !== LIMIT_OPTIONS[0] && "border-l border-border",
								)}
							>
								{opt}
							</button>
						))}
					</div>
				</div>
			</div>

			{/* ── Error ──────────────────────────────────────────────── */}
			{error && (
				<div className="rounded-lg border border-lv-red/30 bg-lv-red/10 px-4 py-3 text-sm text-lv-red">
					{error}
				</div>
			)}

			{/* ── Loading ────────────────────────────────────────────── */}
			{loading && <EventsTableSkeleton />}

			{/* ── Empty state ────────────────────────────────────────── */}
			{!loading && filteredEvents.length === 0 && !error && (
				<div className="flex h-48 items-center justify-center">
					<p className={T.mutedSm}>
						{tab === "all"
							? "No events recorded yet."
							: `No ${tab === "purge" ? "purge" : "S3"} events recorded yet.`}
					</p>
				</div>
			)}

			{/* ── Events table ───────────────────────────────────────── */}
			{!loading && filteredEvents.length > 0 && (
				<Card>
					<CardHeader>
						<CardTitle className={T.sectionHeading}>
							<div className="flex items-center gap-2">
								<Clock className="h-4 w-4 text-muted-foreground" />
								Events ({filteredEvents.length})
							</div>
						</CardTitle>
					</CardHeader>
					<CardContent className="p-0">
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead className={T.sectionLabel}>Time</TableHead>
									<TableHead className={T.sectionLabel}>Source</TableHead>
									<TableHead className={T.sectionLabel}>Identity</TableHead>
									<TableHead className={T.sectionLabel}>Detail</TableHead>
									<TableHead className={T.sectionLabel}>Status</TableHead>
									<TableHead className={cn(T.sectionLabel, "text-right")}>Duration</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{filteredEvents.map((ev) => (
									<TableRow key={`${ev.source}-${ev.id}`}>
										<TableCell className={T.tableCellMono}>
											{formatTime(ev.created_at)}
										</TableCell>
										<TableCell>{sourceBadge(ev.source)}</TableCell>
										<TableCell>
											{ev.source === "purge" ? (
												<code className={T.tableCellMono} title={ev.key_id}>
													{truncateId(ev.key_id ?? "", 10)}
												</code>
											) : (
												<code className={T.tableCellMono} title={ev.credential_id}>
													{truncateId(ev.credential_id ?? "", 12)}
												</code>
											)}
										</TableCell>
										<TableCell>
											{ev.source === "purge" ? (
												<div className="flex items-center gap-2">
													<Badge className={cn(
														ev.purge_type === "single"
															? "bg-lv-purple/20 text-lv-purple border-lv-purple/30"
															: "bg-lv-cyan/20 text-lv-cyan border-lv-cyan/30",
													)}>
														{ev.purge_type}
													</Badge>
													<code className={T.tableCellMono} title={ev.zone_id}>
														{truncateId(ev.zone_id ?? "", 8)}
													</code>
													{ev.collapsed && (
														<Badge className="bg-lv-blue/20 text-lv-blue border-lv-blue/30">
															{ev.collapsed}
														</Badge>
													)}
												</div>
											) : (
												<div className="flex items-center gap-2">
													<Badge className="bg-lv-green/20 text-lv-green border-lv-green/30">
														{ev.operation}
													</Badge>
													{ev.bucket && (
														<code className={T.tableCellMono}>
															{ev.bucket}{ev.s3_key ? `/${truncateId(ev.s3_key, 16)}` : ""}
														</code>
													)}
												</div>
											)}
										</TableCell>
										<TableCell>{statusBadge(ev.status)}</TableCell>
										<TableCell className={T.tableCellNumeric}>
											{ev.duration_ms.toFixed(0)} ms
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					</CardContent>
				</Card>
			)}
		</div>
	);
}
