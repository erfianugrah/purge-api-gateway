import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { T } from '@/lib/typography';
import { cn } from '@/lib/utils';

interface TablePaginationProps {
	page: number;
	totalPages: number;
	totalItems: number;
	pageSize: number;
	pageSizeOptions: readonly number[];
	onPageChange: (page: number) => void;
	onPageSizeChange: (size: number) => void;
	/** Label for the items, e.g. "keys" or "credentials" (default: "items") */
	noun?: string;
}

/** Generates visible page numbers with ellipsis markers (represented as -1). */
function getPageNumbers(current: number, total: number): number[] {
	if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);

	const pages: number[] = [1];
	const left = Math.max(2, current - 1);
	const right = Math.min(total - 1, current + 1);

	if (left > 2) pages.push(-1);
	for (let i = left; i <= right; i++) pages.push(i);
	if (right < total - 1) pages.push(-1);
	pages.push(total);

	return pages;
}

export function TablePagination({
	page,
	totalPages,
	totalItems,
	pageSize,
	pageSizeOptions,
	onPageChange,
	onPageSizeChange,
	noun = 'items',
}: TablePaginationProps) {
	if (totalItems === 0) return null;

	const start = (page - 1) * pageSize + 1;
	const end = Math.min(page * pageSize, totalItems);
	const pageNumbers = getPageNumbers(page, totalPages);

	return (
		<div className="flex items-center justify-between px-4 py-3 border-t border-border">
			{/* Left: item count + page size selector */}
			<div className="flex items-center gap-3">
				<span className={T.muted}>
					{start}–{end} of {totalItems} {noun}
				</span>
				<select
					value={pageSize}
					onChange={(e) => onPageSizeChange(Number(e.target.value))}
					className={cn(
						T.muted,
						'bg-transparent border border-border rounded px-1.5 py-0.5 cursor-pointer',
						'hover:border-muted-foreground/40 focus:outline-none focus:border-lv-purple/50',
					)}
				>
					{pageSizeOptions.map((opt) => (
						<option key={opt} value={opt}>
							{opt} / page
						</option>
					))}
				</select>
			</div>

			{/* Right: page navigation */}
			{totalPages > 1 && (
				<div className="flex items-center gap-1">
					{/* First page */}
					<Button variant="ghost" size="icon-sm" onClick={() => onPageChange(1)} disabled={page === 1} title="First page">
						<ChevronsLeft className="h-3.5 w-3.5" />
					</Button>
					{/* Previous */}
					<Button variant="ghost" size="icon-sm" onClick={() => onPageChange(page - 1)} disabled={page === 1} title="Previous page">
						<ChevronLeft className="h-3.5 w-3.5" />
					</Button>

					{/* Page numbers */}
					{pageNumbers.map((p, i) =>
						p === -1 ? (
							<span key={`ellipsis-${i}`} className={cn(T.muted, 'px-1')}>
								...
							</span>
						) : (
							<Button
								key={p}
								variant={p === page ? 'outline' : 'ghost'}
								size="icon-sm"
								onClick={() => onPageChange(p)}
								className={cn('text-xs font-data tabular-nums min-w-[1.75rem]', p === page && 'border-lv-purple/50 text-lv-purple')}
							>
								{p}
							</Button>
						),
					)}

					{/* Next */}
					<Button variant="ghost" size="icon-sm" onClick={() => onPageChange(page + 1)} disabled={page === totalPages} title="Next page">
						<ChevronRight className="h-3.5 w-3.5" />
					</Button>
					{/* Last page */}
					<Button variant="ghost" size="icon-sm" onClick={() => onPageChange(totalPages)} disabled={page === totalPages} title="Last page">
						<ChevronsRight className="h-3.5 w-3.5" />
					</Button>
				</div>
			)}
		</div>
	);
}
