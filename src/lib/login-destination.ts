// Exact allowlist: login must never navigate to a query-supplied external URL.
export function loginDestination(value: unknown) {
  return value === '/' ||
    value === '/proof' ||
    value === '/admin' ||
    value === '/admin/users' ||
    value === '/admin/catalog' ||
    value === '/admin/analytics' ||
    value === '/admin/inbox' ||
    value === '/admin/operations'
    ? value
    : '/sendbox';
}
