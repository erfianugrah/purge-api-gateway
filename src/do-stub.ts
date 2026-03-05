/** Shared DO stub accessor. All route files use the same DO name ("account"). */

const DO_NAME = 'account';

export function getStub(env: Env) {
	return env.GATEKEEPER.get(env.GATEKEEPER.idFromName(DO_NAME));
}
