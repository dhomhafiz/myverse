// Match the production v2 fencing contract while keeping provider tests focused on their subject.
export function fencedResult(body, result) {
  if (result.granted === true) return { ...result, attemptId: body.attemptId, ownerId: body.ownerId,
    generation: 1, leaseExpiresAt: Date.now() + 30_000, deadlineAt: Date.now() + 60_000 };
  if (result.started === true) return { ...result, leaseExpiresAt: Date.now() + 30_000, deadlineAt: Date.now() + 60_000 };
  return result;
}

export function createTestBudgetBinding() {
  return {
    getByName: () => ({
      fetch: async request => {
        const path = new URL(request.url).pathname;
        const body = await request.json();
        const result = path === '/admit'
          ? { granted: true, grantId: `test-grant-${body.requestId}` }
          : path === '/start'
            ? { started: true }
            : path === '/settle'
              ? { settled: true }
              : { error: 'NOT_FOUND' };
        return new Response(JSON.stringify(fencedResult(body, result)), {
          status: path === '/admit' || path === '/start' || path === '/settle' ? 200 : 404,
          headers: { 'Content-Type': 'application/json' },
        });
      },
    }),
  };
}
