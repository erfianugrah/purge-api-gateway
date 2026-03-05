import { useState, useCallback } from "react";
import { Clock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { getEvents } from "@/lib/api";
import type { PurgeEvent } from "@/lib/api";
import { cn } from "@/lib/utils";
import { T } from "@/lib/typography";

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

function typeBadge(type: "single" | "bulk"): React.ReactNode {
	if (type === "single") {
		return <Badge className="bg-lv-purple/20 text-lv-purple border-lv-purple/30">single</Badge>;
	}
	return <Badge className="bg-lv-cyan/20 text-lv-cyan border-lv-cyan/30">bulk</Badge>;
}

const LIMIT_OPTIONS = [50, 100, 500] as const;

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
	const [inputValue, setInputValue] = useState("");
	const [zoneId, setZoneId] = useState("");
	const [events, setEvents] = useState<PurgeEvent[]>([]);
	const [limit, setLimit] = useState<number>(50);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const fetchData = useCallback(async (zone: string, fetchLimit: number) => {
		if (!zone.trim()) return;
		setZoneId(zone.trim());
		setLoading(true);
		setError(null);
		try {
			const data = await getEvents({ zone_id: zone.trim(), limit: fetchLimit });
			setEvents(data);
		} catch (e: any) {
			setError(e.message ?? "Failed to load events");
			setEvents([]);
		} finally {
			setLoading(false);
		}
	}, []);

	const handleSubmit = () => fetchData(inputValue, limit);
	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === "Enter") fetchData(inputValue, limit);
	};

	const handleLimitChange = (newLimit: number) => {
		setLimit(newLimit);
		if (zoneId) fetchData(zoneId, newLimit);
	};

	return (
		<div className="space-y-6">
			{/* ── Zone ID input + controls ───────────────────────────── */}
			<div className="flex flex-wrap items-center gap-3">
				<Input
					placeholder="Enter Zone ID..."
					value={inputValue}
					onChange={(e) => setInputValue(e.target.value)}
					onKeyDown={handleKeyDown}
					className="max-w-sm font-data"
				/>
				<Button onClick={handleSubmit} disabled={loading || !inputValue.trim()}>
					{loading ? "Loading..." : "Load"}
				</Button>

				{/* Limit selector */}
				<div className="ml-auto flex items-center gap-2">
					<span className={T.formLabel}>Limit</span>
					<div className="flex rounded-md border border-border">
						{LIMIT_OPTIONS.map((opt) => (
							<button
								key={opt}
								onClick={() => handleLimitChange(opt)}
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
			{!loading && !zoneId && !error && (
				<div className="flex h-48 items-center justify-center">
					<p className={T.mutedSm}>Enter a Zone ID to view purge events.</p>
				</div>
			)}

			{!loading && zoneId && events.length === 0 && !error && (
				<div className="flex h-48 items-center justify-center">
					<p className={T.mutedSm}>No events found for this zone.</p>
				</div>
			)}

			{/* ── Events table ───────────────────────────────────────── */}
			{!loading && events.length > 0 && (
				<Card>
					<CardHeader>
						<CardTitle className={T.sectionHeading}>
							<div className="flex items-center gap-2">
								<Clock className="h-4 w-4 text-muted-foreground" />
								Purge Events ({events.length})
							</div>
						</CardTitle>
					</CardHeader>
					<CardContent className="p-0">
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead className={T.sectionLabel}>Time</TableHead>
									<TableHead className={T.sectionLabel}>Key ID</TableHead>
									<TableHead className={T.sectionLabel}>Type</TableHead>
									<TableHead className={T.sectionLabel}>Status</TableHead>
									<TableHead className={cn(T.sectionLabel, "text-right")}>Cost</TableHead>
									<TableHead className={T.sectionLabel}>Collapsed</TableHead>
									<TableHead className={cn(T.sectionLabel, "text-right")}>Duration</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{events.map((ev) => (
									<TableRow key={ev.id}>
										<TableCell className={T.tableCellMono}>
											{formatTime(ev.created_at)}
										</TableCell>
										<TableCell>
											<code className={T.tableCellMono} title={ev.key_id}>
												{truncateId(ev.key_id)}
											</code>
										</TableCell>
										<TableCell>{typeBadge(ev.purge_type)}</TableCell>
										<TableCell>{statusBadge(ev.status)}</TableCell>
										<TableCell className={T.tableCellNumeric}>{ev.cost}</TableCell>
										<TableCell className={T.tableCell}>
											{ev.collapsed ? (
												<Badge className="bg-lv-blue/20 text-lv-blue border-lv-blue/30">
													{ev.collapsed}
												</Badge>
											) : (
												<span className={T.muted}>—</span>
											)}
										</TableCell>
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
