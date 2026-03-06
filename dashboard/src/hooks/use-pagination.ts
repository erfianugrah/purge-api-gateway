import { useState, useMemo, useCallback } from 'react';

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;
const DEFAULT_PAGE_SIZE = 25;

interface UsePaginationOptions {
	/** Default page size (default: 25) */
	defaultPageSize?: number;
}

interface UsePaginationResult<T> {
	/** Current page items */
	pageItems: T[];
	/** Current page (1-indexed) */
	page: number;
	/** Items per page */
	pageSize: number;
	/** Total number of items (pre-pagination) */
	totalItems: number;
	/** Total number of pages */
	totalPages: number;
	/** Available page size options */
	pageSizeOptions: readonly number[];
	/** Go to a specific page */
	setPage: (page: number) => void;
	/** Change the page size (resets to page 1) */
	setPageSize: (size: number) => void;
}

/** Client-side pagination over an already-fetched array. */
export function usePagination<T>(items: T[], options?: UsePaginationOptions): UsePaginationResult<T> {
	const [page, setPageRaw] = useState(1);
	const [pageSize, setPageSizeRaw] = useState(options?.defaultPageSize ?? DEFAULT_PAGE_SIZE);

	const totalItems = items.length;
	const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

	// Clamp page if items shrink (e.g. after filter change)
	const clampedPage = Math.min(page, totalPages);

	const pageItems = useMemo(() => {
		const start = (clampedPage - 1) * pageSize;
		return items.slice(start, start + pageSize);
	}, [items, clampedPage, pageSize]);

	const setPage = useCallback(
		(p: number) => {
			setPageRaw(Math.max(1, Math.min(p, totalPages)));
		},
		[totalPages],
	);

	const setPageSize = useCallback((size: number) => {
		setPageSizeRaw(size);
		setPageRaw(1);
	}, []);

	return {
		pageItems,
		page: clampedPage,
		pageSize,
		totalItems,
		totalPages,
		pageSizeOptions: PAGE_SIZE_OPTIONS,
		setPage,
		setPageSize,
	};
}
