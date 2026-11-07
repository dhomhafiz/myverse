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
        return new Response(JSON.stringify(result), {
          status: path === '/admit' || path === '/start' || path === '/settle' ? 200 : 404,
          headers: { 'Content-Type': 'application/json' },
        });
      },
    }),
  };
}
