import { useState, useCallback } from "react";
import {
	Plus,
	ShieldOff,
	Loader2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { PolicyBuilder } from "@/components/PolicyBuilder";
import { listKeys, createKey, revokeKey } from "@/lib/api";
import type { ApiKey, PolicyDocument } from "@/lib/api";
import { cn } from "@/lib/utils";
import { T } from "@/lib/typography";

// ─── Helpers ────────────────────────────────────────────────────────

function truncateId(id: string, len = 12): string {
	return id.length > len ? `${id.slice(0, len)}...` : id;
}

function formatDate(epoch: number): string {
	return new Date(epoch).toLocaleDateString("en-US", {
		year: "numeric",
		month: "short",
		day: "numeric",
	});
}

// ─── Create Key Dialog ──────────────────────────────────────────────

interface CreateKeyDialogProps {
	zoneId: string;
	onCreated: (secret: string) => void;
}

function makeDefaultPolicy(zoneId: string): PolicyDocument {
	return {
		version: "2025-01-01",
		statements: [
			{
				effect: "allow",
				actions: ["purge:*"],
				resources: [zoneId ? `zone:${zoneId}` : "*"],
			},
		],
	};
}

function CreateKeyDialog({ zoneId, onCreated }: CreateKeyDialogProps) {
	const [open, setOpen] = useState(false);
	const [name, setName] = useState("");
	const [policy, setPolicy] = useState<PolicyDocument>(() => makeDefaultPolicy(zoneId));
	const [creating, setCreating] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const handleCreate = async () => {
		setError(null);
		if (policy.statements.length === 0) {
			setError("Policy must have at least one statement");
			return;
		}
		if (policy.statements.some((s) => s.actions.length === 0)) {
			setError("Each statement must have at least one action");
			return;
		}

		setCreating(true);
		try {
			const result = await createKey({ name, zone_id: zoneId, policy });
			onCreated(result.key.id);
			setOpen(false);
			setName("");
			setPolicy(makeDefaultPolicy(zoneId));
		} catch (e: any) {
			setError(e.message ?? "Failed to create key");
		} finally {
			setCreating(false);
		}
	};

	// Reset policy when zone changes
	const handleOpenChange = (next: boolean) => {
		if (next) setPolicy(makeDefaultPolicy(zoneId));
		setOpen(next);
		setError(null);
	};

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogTrigger asChild>
				<Button size="sm" disabled={!zoneId}>
					<Plus className="h-4 w-4" />
					Create Key
				</Button>
			</DialogTrigger>
			<DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
				<DialogHeader>
					<DialogTitle>Create API Key</DialogTitle>
					<DialogDescription>
						Create a new API key for zone <span className="font-data text-lv-cyan">{truncateId(zoneId, 16)}</span>.
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-4">
					<div className="space-y-2">
						<Label className={T.formLabel}>Key Name</Label>
						<Input
							placeholder="e.g. deploy-bot"
							value={name}
							onChange={(e) => setName(e.target.value)}
						/>
					</div>

					<div className="space-y-2">
						<Label className={T.formLabel}>Policy</Label>
						<PolicyBuilder zoneId={zoneId} value={policy} onChange={setPolicy} />
					</div>

					{error && (
						<p className="text-sm text-lv-red">{error}</p>
					)}
				</div>

				<DialogFooter>
					<Button variant="outline" onClick={() => setOpen(false)}>
						Cancel
					</Button>
					<Button onClick={handleCreate} disabled={creating || !name.trim()}>
						{creating && <Loader2 className="h-4 w-4 animate-spin" />}
						Create
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

// ─── Secret Banner ──────────────────────────────────────────────────

function SecretBanner({ secret, onDismiss }: { secret: string; onDismiss: () => void }) {
	const [copied, setCopied] = useState(false);

	const handleCopy = async () => {
		await navigator.clipboard.writeText(secret);
		setCopied(true);
		setTimeout(() => setCopied(false), 2000);
	};

	return (
		<div className="rounded-lg border border-lv-green/30 bg-lv-green/10 px-4 py-3 space-y-2">
			<p className="text-sm font-medium text-lv-green">
				Key created! Copy the secret now — it will not be shown again.
			</p>
			<div className="flex items-center gap-2">
				<code className="flex-1 break-all rounded bg-lovelace-800 px-3 py-1.5 font-data text-xs text-foreground">
					{secret}
				</code>
				<Button size="sm" variant="outline" onClick={handleCopy}>
					{copied ? "Copied!" : "Copy"}
				</Button>
				<Button size="sm" variant="ghost" onClick={onDismiss}>
					Dismiss
				</Button>
			</div>
		</div>
	);
}

// ─── Loading Skeleton ───────────────────────────────────────────────

function KeysTableSkeleton() {
	return (
		<div className="space-y-2">
			{Array.from({ length: 5 }).map((_, i) => (
				<Skeleton key={i} className="h-10 w-full" />
			))}
		</div>
	);
}

// ─── Keys Page ──────────────────────────────────────────────────────

export function KeysPage() {
	const [inputValue, setInputValue] = useState("");
	const [zoneId, setZoneId] = useState("");
	const [keys, setKeys] = useState<ApiKey[]>([]);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [secret, setSecret] = useState<string | null>(null);
	const [revokingId, setRevokingId] = useState<string | null>(null);

	const fetchKeys = useCallback(async (zone: string) => {
		if (!zone.trim()) return;
		setZoneId(zone.trim());
		setLoading(true);
		setError(null);
		try {
			const data = await listKeys(zone.trim());
			setKeys(data);
		} catch (e: any) {
			setError(e.message ?? "Failed to load keys");
			setKeys([]);
		} finally {
			setLoading(false);
		}
	}, []);

	const handleSubmit = () => fetchKeys(inputValue);
	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === "Enter") fetchKeys(inputValue);
	};

	const handleRevoke = async (keyId: string) => {
		if (!confirm(`Revoke key ${truncateId(keyId)}? This cannot be undone.`)) return;
		setRevokingId(keyId);
		try {
			await revokeKey(keyId, zoneId);
			await fetchKeys(zoneId);
		} catch (e: any) {
			setError(e.message ?? "Failed to revoke key");
		} finally {
			setRevokingId(null);
		}
	};

	const handleKeyCreated = (newSecret: string) => {
		setSecret(newSecret);
		fetchKeys(zoneId);
	};

	return (
		<div className="space-y-6">
			{/* ── Zone ID input ──────────────────────────────────────── */}
			<div className="flex items-center gap-3">
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
				<div className="ml-auto">
					<CreateKeyDialog zoneId={zoneId} onCreated={handleKeyCreated} />
				</div>
			</div>

			{/* ── Secret banner ──────────────────────────────────────── */}
			{secret && <SecretBanner secret={secret} onDismiss={() => setSecret(null)} />}

			{/* ── Error ──────────────────────────────────────────────── */}
			{error && (
				<div className="rounded-lg border border-lv-red/30 bg-lv-red/10 px-4 py-3 text-sm text-lv-red">
					{error}
				</div>
			)}

			{/* ── Loading ────────────────────────────────────────────── */}
			{loading && <KeysTableSkeleton />}

			{/* ── Empty state ────────────────────────────────────────── */}
			{!loading && zoneId && keys.length === 0 && !error && (
				<div className="flex h-48 items-center justify-center">
					<p className={T.mutedSm}>No keys found for this zone.</p>
				</div>
			)}

			{/* ── No zone ────────────────────────────────────────────── */}
			{!loading && !zoneId && !error && (
				<div className="flex h-48 items-center justify-center">
					<p className={T.mutedSm}>Enter a Zone ID to manage API keys.</p>
				</div>
			)}

			{/* ── Keys table ─────────────────────────────────────────── */}
			{!loading && keys.length > 0 && (
				<Card>
					<CardHeader>
						<CardTitle className={T.sectionHeading}>
							API Keys ({keys.length})
						</CardTitle>
					</CardHeader>
					<CardContent className="p-0">
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead className={T.sectionLabel}>Name</TableHead>
									<TableHead className={T.sectionLabel}>ID</TableHead>
									<TableHead className={T.sectionLabel}>Status</TableHead>
									<TableHead className={T.sectionLabel}>Created</TableHead>
									<TableHead className={T.sectionLabel}>Expires</TableHead>
									<TableHead className={T.sectionLabel}>Created By</TableHead>
									<TableHead className={cn(T.sectionLabel, "text-right")}>Actions</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{keys.map((k) => (
									<TableRow key={k.id}>
										<TableCell className={T.tableRowName}>{k.name}</TableCell>
										<TableCell>
											<code className={T.tableCellMono} title={k.id}>
												{truncateId(k.id)}
											</code>
										</TableCell>
										<TableCell>
											{k.revoked ? (
												<Badge className="bg-lv-red/20 text-lv-red border-lv-red/30">Revoked</Badge>
											) : (
												<Badge className="bg-lv-green/20 text-lv-green border-lv-green/30">Active</Badge>
											)}
										</TableCell>
										<TableCell className={T.tableCell}>{formatDate(k.created_at)}</TableCell>
										<TableCell className={T.tableCell}>
											{k.expires_at ? formatDate(k.expires_at) : <span className={T.muted}>Never</span>}
										</TableCell>
										<TableCell className={T.tableCell}>
											{k.created_by ?? <span className={T.muted}>—</span>}
										</TableCell>
										<TableCell className="text-right">
											{!k.revoked && (
												<Button
													size="xs"
													variant="ghost"
													className="text-lv-red hover:text-lv-red-bright hover:bg-lv-red/10"
													onClick={() => handleRevoke(k.id)}
													disabled={revokingId === k.id}
												>
													{revokingId === k.id ? (
														<Loader2 className="h-3.5 w-3.5 animate-spin" />
													) : (
														<ShieldOff className="h-3.5 w-3.5" />
													)}
													Revoke
												</Button>
											)}
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
