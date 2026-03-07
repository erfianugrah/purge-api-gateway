import { useState } from 'react';
import { Send, Loader2, CheckCircle, XCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { T } from '@/lib/typography';

const ZONE_ID_RE = /^[a-f0-9]{32}$/;

// ─── Types ──────────────────────────────────────────────────────────

type PurgeType = 'urls' | 'hosts' | 'tags' | 'prefixes' | 'everything';

interface PurgeOption {
	value: PurgeType;
	label: string;
	placeholder: string;
}

const PURGE_OPTIONS: PurgeOption[] = [
	{ value: 'urls', label: 'URLs', placeholder: 'https://example.com/css/style.css\nhttps://example.com/js/app.js' },
	{ value: 'hosts', label: 'Hosts', placeholder: 'www.example.com\nimages.example.com' },
	{ value: 'tags', label: 'Tags', placeholder: 'tag-a\ntag-b' },
	{ value: 'prefixes', label: 'Prefixes', placeholder: 'www.example.com/css\nwww.example.com/js' },
	{ value: 'everything', label: 'Everything', placeholder: '' },
];

interface PurgeResponse {
	success: boolean;
	data: any;
}

// ─── Purge Page ─────────────────────────────────────────────────────

export function PurgePage() {
	const [zoneId, setZoneId] = useState('');
	const [purgeType, setPurgeType] = useState<PurgeType>('urls');
	const [values, setValues] = useState('');
	const [apiKey, setApiKey] = useState('');
	const [submitting, setSubmitting] = useState(false);
	const [response, setResponse] = useState<PurgeResponse | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [zoneIdError, setZoneIdError] = useState<string | null>(null);

	const selectedOption = PURGE_OPTIONS.find((o) => o.value === purgeType)!;

	const buildBody = (): Record<string, any> => {
		if (purgeType === 'everything') {
			return { purge_everything: true };
		}

		const lines = values
			.split('\n')
			.map((l) => l.trim())
			.filter(Boolean);

		if (lines.length === 0) {
			throw new Error('Enter at least one value');
		}

		// Map purge type to the Cloudflare API field name
		const fieldMap: Record<string, string> = {
			urls: 'files',
			hosts: 'hosts',
			tags: 'tags',
			prefixes: 'prefixes',
		};

		return { [fieldMap[purgeType]]: lines };
	};

	const handleSubmit = async () => {
		setError(null);
		setResponse(null);
		setZoneIdError(null);

		const trimmedZone = zoneId.trim();
		if (!trimmedZone) {
			setZoneIdError('Zone ID is required');
			return;
		}
		if (!ZONE_ID_RE.test(trimmedZone)) {
			setZoneIdError('Zone ID must be a 32-character hex string');
			return;
		}
		if (!apiKey.trim()) {
			setError('API key is required');
			return;
		}

		let body: Record<string, any>;
		try {
			body = buildBody();
		} catch (e: any) {
			setError(e.message);
			return;
		}

		setSubmitting(true);
		try {
			const res = await fetch(`/v1/zones/${trimmedZone}/purge_cache`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${apiKey.trim()}`,
				},
				body: JSON.stringify(body),
			});

			let data: any;
			try {
				data = await res.json();
			} catch {
				setError(`Server returned non-JSON response (HTTP ${res.status})`);
				return;
			}
			setResponse({ success: data.success ?? res.ok, data });
		} catch (e: any) {
			setError(e.message ?? 'Request failed');
		} finally {
			setSubmitting(false);
		}
	};

	return (
		<div className="mx-auto max-w-2xl space-y-6">
			<Card>
				<CardHeader>
					<CardTitle className={T.sectionHeading}>Manual Purge</CardTitle>
					<p className={T.muted}>Send a purge request directly to the gateway API using your API key.</p>
				</CardHeader>
				<CardContent className="space-y-5">
					{/* ── Zone ID ────────────────────────────────────────── */}
					<div className="space-y-2">
						<Label className={T.formLabel}>Zone ID</Label>
						<Input
							placeholder="e.g. abc123def456..."
							value={zoneId}
							onChange={(e) => {
								setZoneId(e.target.value);
								setZoneIdError(null);
							}}
							className={cn('font-data', zoneIdError && 'border-lv-red')}
						/>
						{zoneIdError && <p className="text-xs text-lv-red">{zoneIdError}</p>}
					</div>

					{/* ── API Key ────────────────────────────────────────── */}
					<div className="space-y-2">
						<Label className={T.formLabel}>API Key</Label>
						<Input
							type="password"
							placeholder="Bearer token..."
							value={apiKey}
							onChange={(e) => setApiKey(e.target.value)}
							className="font-data"
						/>
						<p className={T.muted}>Used as the Authorization: Bearer header.</p>
					</div>

					<Separator />

					{/* ── Purge Type ─────────────────────────────────────── */}
					<div className="space-y-2">
						<Label className={T.formLabel}>Purge Type</Label>
						<select
							value={purgeType}
							onChange={(e) => setPurgeType(e.target.value as PurgeType)}
							className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
						>
							{PURGE_OPTIONS.map((opt) => (
								<option key={opt.value} value={opt.value} className="bg-lovelace-800">
									{opt.label}
								</option>
							))}
						</select>
					</div>

					{/* ── Values textarea ─────────────────────────────────── */}
					{purgeType !== 'everything' && (
						<div className="space-y-2">
							<Label className={T.formLabel}>Values (one per line)</Label>
							<textarea
								className="flex min-h-[120px] w-full rounded-md border border-input bg-transparent px-3 py-2 font-data text-xs shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
								placeholder={selectedOption.placeholder}
								value={values}
								onChange={(e) => setValues(e.target.value)}
							/>
						</div>
					)}

					{purgeType === 'everything' && (
						<div className="rounded-lg border border-lv-peach/30 bg-lv-peach/10 px-4 py-3">
							<p className="text-sm text-lv-peach">This will purge all cached content for the zone. Use with caution.</p>
						</div>
					)}

					{/* ── Submit ──────────────────────────────────────────── */}
					<Button onClick={handleSubmit} disabled={submitting || !zoneId.trim() || !apiKey.trim()} className="w-full">
						{submitting ? (
							<>
								<Loader2 className="h-4 w-4 animate-spin" />
								Sending...
							</>
						) : (
							<>
								<Send className="h-4 w-4" />
								Send Purge Request
							</>
						)}
					</Button>
				</CardContent>
			</Card>

			{/* ── Error ──────────────────────────────────────────────── */}
			{error && <div className="rounded-lg border border-lv-red/30 bg-lv-red/10 px-4 py-3 text-sm text-lv-red">{error}</div>}

			{/* ── Response ───────────────────────────────────────────── */}
			{response && (
				<Card>
					<CardHeader>
						<CardTitle className={cn(T.sectionHeading, 'flex items-center gap-2')}>
							{response.success ? (
								<>
									<CheckCircle className="h-4 w-4 text-lv-green" />
									<span className="text-lv-green">Success</span>
								</>
							) : (
								<>
									<XCircle className="h-4 w-4 text-lv-red" />
									<span className="text-lv-red">Error</span>
								</>
							)}
						</CardTitle>
					</CardHeader>
					<CardContent>
						<pre className="overflow-auto rounded-lg bg-lovelace-950 p-4 font-data text-xs leading-relaxed text-foreground">
							{JSON.stringify(response.data, null, 2)}
						</pre>
					</CardContent>
				</Card>
			)}
		</div>
	);
}
