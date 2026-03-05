import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RequestCollapser } from '../src/request-collapse';

describe('RequestCollapser', () => {
	let collapser: RequestCollapser<string>;

	beforeEach(() => {
		vi.useRealTimers();
		collapser = new RequestCollapser(50);
	});

	it('leader returns collapsed=false with a flightId', async () => {
		const { result, collapsed, flightId } = await collapser.collapseOrCreate('k1', () => Promise.resolve('hello'));
		expect(result).toBe('hello');
		expect(collapsed).toBe(false);
		expect(flightId).toMatch(/^[0-9a-f]{8}$/);
	});

	it('concurrent followers share the leader result and flightId', async () => {
		let resolveLeader!: (v: string) => void;
		const leaderPromise = new Promise<string>((r) => {
			resolveLeader = r;
		});

		const p1 = collapser.collapseOrCreate('k1', () => leaderPromise);
		const p2 = collapser.collapseOrCreate('k1', () => Promise.resolve('should not run'));
		const p3 = collapser.collapseOrCreate('k1', () => Promise.resolve('should not run'));

		resolveLeader('leader-result');

		const [r1, r2, r3] = await Promise.all([p1, p2, p3]);

		expect(r1.result).toBe('leader-result');
		expect(r1.collapsed).toBe(false);

		expect(r2.result).toBe('leader-result');
		expect(r2.collapsed).toBe(true);
		expect(r2.flightId).toBe(r1.flightId);

		expect(r3.result).toBe('leader-result');
		expect(r3.collapsed).toBe(true);
		expect(r3.flightId).toBe(r1.flightId);
	});

	it('different keys do not collapse', async () => {
		const r1 = await collapser.collapseOrCreate('k1', () => Promise.resolve('one'));
		const r2 = await collapser.collapseOrCreate('k2', () => Promise.resolve('two'));
		expect(r1.result).toBe('one');
		expect(r2.result).toBe('two');
		expect(r1.collapsed).toBe(false);
		expect(r2.collapsed).toBe(false);
		expect(r1.flightId).not.toBe(r2.flightId);
	});

	it('stale entries are NOT collapsed after grace window expires', async () => {
		vi.useFakeTimers();

		const r1 = await collapser.collapseOrCreate('k1', () => Promise.resolve('first'));
		expect(r1.collapsed).toBe(false);

		// Advance well past the 50ms grace window
		vi.advanceTimersByTime(200);

		// This should NOT collapse — the entry should be detected as stale
		const r2 = await collapser.collapseOrCreate('k1', () => Promise.resolve('second'));
		expect(r2.collapsed).toBe(false);
		expect(r2.result).toBe('second');
		expect(r2.flightId).not.toBe(r1.flightId);
	});

	it('entries within grace window ARE collapsed', async () => {
		vi.useFakeTimers();

		const r1 = await collapser.collapseOrCreate('k1', () => Promise.resolve('first'));
		expect(r1.collapsed).toBe(false);

		// Only 10ms — well within the 50ms grace
		vi.advanceTimersByTime(10);

		const r2 = await collapser.collapseOrCreate('k1', () => Promise.resolve('should not run'));
		expect(r2.collapsed).toBe(true);
		expect(r2.result).toBe('first');
		expect(r2.flightId).toBe(r1.flightId);
	});

	it('failed leader does not block subsequent requests', async () => {
		const r1Promise = collapser.collapseOrCreate('k1', () => Promise.reject(new Error('boom')));
		await expect(r1Promise).rejects.toThrow('boom');

		// After leader failure, next request creates a new flight
		const r2 = await collapser.collapseOrCreate('k1', () => Promise.resolve('recovered'));
		expect(r2.collapsed).toBe(false);
		expect(r2.result).toBe('recovered');
	});

	it('failed leader is retried by follower that finds it', async () => {
		let rejectLeader!: (e: Error) => void;
		const leaderPromise = new Promise<string>((_, reject) => {
			rejectLeader = reject;
		});

		const p1 = collapser.collapseOrCreate('k1', () => leaderPromise);
		// p2 finds the existing entry, awaits it — leader will fail
		const p2 = collapser.collapseOrCreate('k1', () => Promise.resolve('retry-ok'));

		rejectLeader(new Error('leader-fail'));

		await expect(p1).rejects.toThrow('leader-fail');

		// p2 should have retried with its own createFlight after the leader failed
		const r2 = await p2;
		expect(r2.collapsed).toBe(false);
		expect(r2.result).toBe('retry-ok');
	});

	it('size tracks active entries', async () => {
		expect(collapser.size).toBe(0);

		let resolveLeader!: (v: string) => void;
		const leaderPromise = new Promise<string>((r) => {
			resolveLeader = r;
		});

		const p = collapser.collapseOrCreate('k1', () => leaderPromise);
		expect(collapser.size).toBe(1);

		resolveLeader('done');
		await p;

		// Entry stays in map during grace window
		expect(collapser.size).toBe(1);
	});

	it('__testClear removes all entries', async () => {
		await collapser.collapseOrCreate('k1', () => Promise.resolve('a'));
		await collapser.collapseOrCreate('k2', () => Promise.resolve('b'));
		expect(collapser.size).toBeGreaterThan(0);

		collapser.__testClear();
		expect(collapser.size).toBe(0);
	});
});
