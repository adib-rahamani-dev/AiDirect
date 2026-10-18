// Exact allowlist: login must never navigate to a query-supplied external URL.
export function loginDestination(value: unknown) {
  return value === '/' ||
    value === '/proof' ||
    value === '/admin' ||
    value === '/admin/catalog' ||
    value === '/admin/operations'
    ? value
    : '/sendbox';
}
