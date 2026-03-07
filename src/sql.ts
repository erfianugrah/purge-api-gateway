/** Type-safe helper to avoid repetitive `as unknown as T[]` on every DO SQLite query. */
export function queryAll<T>(sql: SqlStorage, query: string, ...params: unknown[]): T[] {
	return sql.exec(query, ...params).toArray() as unknown as T[];
}
