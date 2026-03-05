import { useState, useEffect, useCallback } from "react";
import {
	PieChart,
	Pie,
	Cell,
	BarChart,
	Bar,
	XAxis,
	YAxis,
	Tooltip,
	ResponsiveContainer,
} from "recharts";
import {
	Activity,
	Link,
	Timer,
	Layers,
	AlertTriangle,
	HardDrive,
	Cloud,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getSummary, getS3Summary } from "@/lib/api";
import type { AnalyticsSummary, S3AnalyticsSummary } from "@/lib/api";
import { cn } from "@/lib/utils";
import { STATUS_COLORS, PURGE_TYPE_COLORS, CHART_PALETTE, CHART_TOOLTIP_STYLE } from "@/lib/utils";
import { T } from "@/lib/typography";

// ─── Helpers ────────────────────────────────────────────────────────

function statusColor(code: string): string {
	const n = Number(code);
	if (n >= 200 && n < 300) return STATUS_COLORS.success;
	if (n === 429) return STATUS_COLORS.rate_limited;
	if (n === 403) return STATUS_COLORS.denied;
	if (n >= 400) return STATUS_COLORS.error;
	return STATUS_COLORS.collapsed;
}

function formatNumber(n: number): string {
	if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
	if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
	return n.toLocaleString();
}

function mergeByStatus(
	purge: Record<string, number>,
	s3: Record<string, number>,
): Record<string, number> {
	const merged: Record<string, number> = { ...purge };
	for (const [k, v] of Object.entries(s3)) {
		merged[k] = (merged[k] ?? 0) + v;
	}
	return merged;
}

// ─── Stat Card ──────────────────────────────────────────────────────

interface StatCardProps {
	label: string;
	value: string;
	icon: React.ReactNode;
	iconBg: string;
	delay: number;
}

function StatCard({ label, value, icon, iconBg, delay }: StatCardProps) {
	return (
		<Card
			className="animate-fade-in-up opacity-0"
			style={{ animationDelay: `${delay}ms` }}
		>
			<CardContent className="flex items-center gap-4 p-5">
				<div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg", iconBg)}>
					{icon}
				</div>
				<div className="min-w-0">
					<p className={T.statLabelUpper}>{label}</p>
					<p className={T.statValue}>{value}</p>
				</div>
			</CardContent>
		</Card>
	);
}

// ─── Loading Skeleton ───────────────────────────────────────────────

function LoadingSkeleton() {
	return (
		<div className="space-y-6">
			<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
				{Array.from({ length: 5 }).map((_, i) => (
					<Card key={i}>
						<CardContent className="flex items-center gap-4 p-5">
							<Skeleton className="h-10 w-10 rounded-lg" />
							<div className="space-y-2">
								<Skeleton className="h-3 w-20" />
								<Skeleton className="h-7 w-16" />
							</div>
						</CardContent>
					</Card>
				))}
			</div>
			<div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
				<Card>
					<CardHeader><Skeleton className="h-4 w-40" /></CardHeader>
					<CardContent><Skeleton className="mx-auto h-52 w-52 rounded-full" /></CardContent>
				</Card>
				<Card>
					<CardHeader><Skeleton className="h-4 w-40" /></CardHeader>
					<CardContent><Skeleton className="h-52 w-full" /></CardContent>
				</Card>
			</div>
		</div>
	);
}

// ─── Overview Dashboard ─────────────────────────────────────────────

export function OverviewDashboard() {
	const [purgeSummary, setPurgeSummary] = useState<AnalyticsSummary | null>(null);
	const [s3Summary, setS3Summary] = useState<S3AnalyticsSummary | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const fetchData = useCallback(async () => {
		setLoading(true);
		setError(null);
		try {
			const [purge, s3] = await Promise.all([
				getSummary().catch(() => null),
				getS3Summary().catch(() => null),
			]);
			if (!purge && !s3) {
				throw new Error("Failed to load analytics from both purge and S3 endpoints");
			}
			setPurgeSummary(purge);
			setS3Summary(s3);
		} catch (e: any) {
			setError(e.message ?? "Failed to load summary");
			setPurgeSummary(null);
			setS3Summary(null);
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		fetchData();
	}, [fetchData]);

	// ── Derived data ──────────────────────────────────────────────

	const purgeTotal = purgeSummary?.total_requests ?? 0;
	const s3Total = s3Summary?.total_requests ?? 0;
	const totalRequests = purgeTotal + s3Total;

	// Combined status breakdown
	const mergedStatus = mergeByStatus(
		purgeSummary?.by_status ?? {},
		s3Summary?.by_status ?? {},
	);
	const barData = Object.entries(mergedStatus)
		.map(([status, count]) => ({ status, count }))
		.sort((a, b) => Number(a.status) - Number(b.status));

	// Purge type pie
	const purgeTypePie = purgeSummary
		? Object.entries(purgeSummary.by_purge_type).map(([name, value]) => ({ name, value }))
		: [];

	// S3 operation pie
	const s3OpPie = s3Summary
		? Object.entries(s3Summary.by_operation)
				.sort((a, b) => b[1] - a[1])
				.slice(0, 10)
				.map(([name, value]) => ({ name, value }))
		: [];

	// S3 bucket pie
	const s3BucketPie = s3Summary
		? Object.entries(s3Summary.by_bucket)
				.sort((a, b) => b[1] - a[1])
				.slice(0, 10)
				.map(([name, value]) => ({ name, value }))
		: [];

	// Traffic split (purge vs s3)
	const trafficPie = [
		...(purgeTotal > 0 ? [{ name: "Purge", value: purgeTotal }] : []),
		...(s3Total > 0 ? [{ name: "S3", value: s3Total }] : []),
	];
	const TRAFFIC_COLORS: Record<string, string> = {
		Purge: "#c574dd",
		S3: "#79e6f3",
	};

	// Combined avg latency
	const avgLatency =
		totalRequests > 0
			? Math.round(
					((purgeSummary?.avg_duration_ms ?? 0) * purgeTotal +
						(s3Summary?.avg_duration_ms ?? 0) * s3Total) /
						totalRequests,
				)
			: 0;

	// Error stats
	const errorCount = Object.entries(mergedStatus)
		.filter(([s]) => Number(s) >= 400)
		.reduce((acc, [, v]) => acc + v, 0);
	const errorPct = totalRequests > 0 ? ((errorCount / totalRequests) * 100).toFixed(1) : "0";

	const collapsedPct =
		purgeTotal > 0
			? (((purgeSummary?.collapsed_count ?? 0) / purgeTotal) * 100).toFixed(1)
			: "0";

	return (
		<div className="space-y-6">
			{/* ── Error ──────────────────────────────────────────────── */}
			{error && (
				<div className="rounded-lg border border-lv-red/30 bg-lv-red/10 px-4 py-3 text-sm text-lv-red">
					{error}
				</div>
			)}

			{/* ── Loading ────────────────────────────────────────────── */}
			{loading && <LoadingSkeleton />}

			{/* ── Empty state ────────────────────────────────────────── */}
			{!loading && totalRequests === 0 && !error && (
				<div className="flex h-64 items-center justify-center">
					<p className={T.mutedSm}>No events recorded yet.</p>
				</div>
			)}

			{/* ── Data ───────────────────────────────────────────────── */}
			{!loading && totalRequests > 0 && (
				<>
					{/* Stat cards */}
					<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
						<StatCard
							label="Total Requests"
							value={formatNumber(totalRequests)}
							icon={<Activity className="h-5 w-5 text-lv-green" />}
							iconBg="bg-lv-green/15"
							delay={0}
						/>
						<StatCard
							label="Purge Requests"
							value={formatNumber(purgeTotal)}
							icon={<Cloud className="h-5 w-5 text-lv-purple" />}
							iconBg="bg-lv-purple/15"
							delay={60}
						/>
						<StatCard
							label="S3 Requests"
							value={formatNumber(s3Total)}
							icon={<HardDrive className="h-5 w-5 text-lv-cyan" />}
							iconBg="bg-lv-cyan/15"
							delay={120}
						/>
						<StatCard
							label="Avg Latency"
							value={`${avgLatency} ms`}
							icon={<Timer className="h-5 w-5 text-lv-blue" />}
							iconBg="bg-lv-blue/15"
							delay={180}
						/>
						<StatCard
							label="Error Rate"
							value={`${errorPct}%`}
							icon={<AlertTriangle className="h-5 w-5 text-lv-red" />}
							iconBg="bg-lv-red/15"
							delay={240}
						/>
					</div>

					{/* Row 1: Traffic split + Status breakdown */}
					<div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
						{/* Traffic split pie */}
						<Card>
							<CardHeader>
								<CardTitle className={T.sectionHeading}>Traffic Split</CardTitle>
							</CardHeader>
							<CardContent>
								{trafficPie.length === 0 ? (
									<p className={cn(T.muted, "py-12 text-center")}>No data</p>
								) : (
									<ResponsiveContainer width="100%" height={260}>
										<PieChart>
											<Pie
												data={trafficPie}
												cx="50%"
												cy="50%"
												innerRadius={60}
												outerRadius={100}
												paddingAngle={4}
												dataKey="value"
												nameKey="name"
												label={({ name, percent }) =>
													`${name} ${(percent * 100).toFixed(0)}%`
												}
												labelLine={false}
												fontSize={T.chartLabel}
											>
												{trafficPie.map((entry) => (
													<Cell
														key={entry.name}
														fill={TRAFFIC_COLORS[entry.name] ?? "#8796f4"}
													/>
												))}
											</Pie>
											<Tooltip
												contentStyle={CHART_TOOLTIP_STYLE.contentStyle}
												itemStyle={CHART_TOOLTIP_STYLE.itemStyle}
												labelStyle={CHART_TOOLTIP_STYLE.labelStyle}
											/>
										</PieChart>
									</ResponsiveContainer>
								)}
							</CardContent>
						</Card>

						{/* Combined status breakdown */}
						<Card>
							<CardHeader>
								<CardTitle className={T.sectionHeading}>Status Breakdown</CardTitle>
							</CardHeader>
							<CardContent>
								{barData.length === 0 ? (
									<p className={cn(T.muted, "py-12 text-center")}>No data</p>
								) : (
									<ResponsiveContainer width="100%" height={260}>
										<BarChart
											data={barData}
											layout="vertical"
											margin={{ top: 0, right: 12, bottom: 0, left: 8 }}
										>
											<XAxis type="number" tick={{ fontSize: T.chartAxisTick, fill: "#bdbdc1" }} />
											<YAxis
												type="category"
												dataKey="status"
												tick={{ fontSize: T.chartAxisTick, fill: "#bdbdc1" }}
												width={40}
											/>
											<Tooltip
												contentStyle={CHART_TOOLTIP_STYLE.contentStyle}
												itemStyle={CHART_TOOLTIP_STYLE.itemStyle}
												labelStyle={CHART_TOOLTIP_STYLE.labelStyle}
												formatter={(value: number) => [formatNumber(value), "Requests"]}
											/>
											<Bar dataKey="count" radius={[0, 4, 4, 0]}>
												{barData.map((entry) => (
													<Cell
														key={entry.status}
														fill={statusColor(entry.status)}
													/>
												))}
											</Bar>
										</BarChart>
									</ResponsiveContainer>
								)}
							</CardContent>
						</Card>
					</div>

					{/* Row 2: Purge types + S3 operations */}
					<div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
						{/* Purge type distribution */}
						{purgeTotal > 0 && (
							<Card>
								<CardHeader>
									<CardTitle className={T.sectionHeading}>Purge Type Distribution</CardTitle>
								</CardHeader>
								<CardContent>
									{purgeTypePie.length === 0 ? (
										<p className={cn(T.muted, "py-12 text-center")}>No data</p>
									) : (
										<ResponsiveContainer width="100%" height={260}>
											<PieChart>
												<Pie
													data={purgeTypePie}
													cx="50%"
													cy="50%"
													innerRadius={60}
													outerRadius={100}
													paddingAngle={4}
													dataKey="value"
													nameKey="name"
													label={({ name, percent }) =>
														`${name} ${(percent * 100).toFixed(0)}%`
													}
													labelLine={false}
													fontSize={T.chartLabel}
												>
													{purgeTypePie.map((entry) => (
														<Cell
															key={entry.name}
															fill={
																PURGE_TYPE_COLORS[entry.name as keyof typeof PURGE_TYPE_COLORS] ??
																"#8796f4"
															}
														/>
													))}
												</Pie>
												<Tooltip
													contentStyle={CHART_TOOLTIP_STYLE.contentStyle}
													itemStyle={CHART_TOOLTIP_STYLE.itemStyle}
													labelStyle={CHART_TOOLTIP_STYLE.labelStyle}
												/>
											</PieChart>
										</ResponsiveContainer>
									)}
								</CardContent>
							</Card>
						)}

						{/* S3 operations breakdown */}
						{s3Total > 0 && (
							<Card>
								<CardHeader>
									<CardTitle className={T.sectionHeading}>S3 Operations</CardTitle>
								</CardHeader>
								<CardContent>
									{s3OpPie.length === 0 ? (
										<p className={cn(T.muted, "py-12 text-center")}>No data</p>
									) : (
										<ResponsiveContainer width="100%" height={260}>
											<BarChart
												data={s3OpPie}
												layout="vertical"
												margin={{ top: 0, right: 12, bottom: 0, left: 8 }}
											>
												<XAxis type="number" tick={{ fontSize: T.chartAxisTick, fill: "#bdbdc1" }} />
												<YAxis
													type="category"
													dataKey="name"
													tick={{ fontSize: T.chartAxisTick, fill: "#bdbdc1" }}
													width={100}
												/>
												<Tooltip
													contentStyle={CHART_TOOLTIP_STYLE.contentStyle}
													itemStyle={CHART_TOOLTIP_STYLE.itemStyle}
													labelStyle={CHART_TOOLTIP_STYLE.labelStyle}
													formatter={(value: number) => [formatNumber(value), "Requests"]}
												/>
												<Bar dataKey="value" radius={[0, 4, 4, 0]}>
													{s3OpPie.map((entry, i) => (
														<Cell
															key={entry.name}
															fill={CHART_PALETTE[i % CHART_PALETTE.length]}
														/>
													))}
												</Bar>
											</BarChart>
										</ResponsiveContainer>
									)}
								</CardContent>
							</Card>
						)}
					</div>

					{/* Row 3: S3 bucket breakdown (only if S3 data) + purge extras */}
					{s3Total > 0 && s3BucketPie.length > 0 && (
						<div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
							<Card>
								<CardHeader>
									<CardTitle className={T.sectionHeading}>S3 Requests by Bucket</CardTitle>
								</CardHeader>
								<CardContent>
									<ResponsiveContainer width="100%" height={260}>
										<PieChart>
											<Pie
												data={s3BucketPie}
												cx="50%"
												cy="50%"
												innerRadius={60}
												outerRadius={100}
												paddingAngle={4}
												dataKey="value"
												nameKey="name"
												label={({ name, percent }) =>
													`${name} ${(percent * 100).toFixed(0)}%`
												}
												labelLine={false}
												fontSize={T.chartLabel}
											>
												{s3BucketPie.map((entry, i) => (
													<Cell
														key={entry.name}
														fill={CHART_PALETTE[i % CHART_PALETTE.length]}
													/>
												))}
											</Pie>
											<Tooltip
												contentStyle={CHART_TOOLTIP_STYLE.contentStyle}
												itemStyle={CHART_TOOLTIP_STYLE.itemStyle}
												labelStyle={CHART_TOOLTIP_STYLE.labelStyle}
											/>
										</PieChart>
									</ResponsiveContainer>
								</CardContent>
							</Card>

							{/* Purge collapsed % + URLs purged (if purge data exists) */}
							{purgeTotal > 0 && (
								<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
									<StatCard
										label="URLs Purged"
										value={formatNumber(purgeSummary?.total_urls_purged ?? 0)}
										icon={<Link className="h-5 w-5 text-lv-peach" />}
										iconBg="bg-lv-peach/15"
										delay={0}
									/>
									<StatCard
										label="Collapsed %"
										value={`${collapsedPct}%`}
										icon={<Layers className="h-5 w-5 text-lv-blue" />}
										iconBg="bg-lv-blue/15"
										delay={60}
									/>
								</div>
							)}
						</div>
					)}

					{/* Show purge extras in stat row if there's no S3 bucket chart to pair with */}
					{purgeTotal > 0 && (s3Total === 0 || s3BucketPie.length === 0) && (
						<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
							<StatCard
								label="URLs Purged"
								value={formatNumber(purgeSummary?.total_urls_purged ?? 0)}
								icon={<Link className="h-5 w-5 text-lv-peach" />}
								iconBg="bg-lv-peach/15"
								delay={0}
							/>
							<StatCard
								label="Collapsed %"
								value={`${collapsedPct}%`}
								icon={<Layers className="h-5 w-5 text-lv-blue" />}
								iconBg="bg-lv-blue/15"
								delay={60}
							/>
						</div>
					)}
				</>
			)}
		</div>
	);
}
