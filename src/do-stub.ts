/** Shared DO stub accessor. All route files use the same DO name ("account"). */

import type { Gatekeeper } from './durable-object';

const DO_NAME = 'account';

export function getStub(env: Env): DurableObjectStub<Gatekeeper> {
	return env.GATEKEEPER.get(env.GATEKEEPER.idFromName(DO_NAME));
}
