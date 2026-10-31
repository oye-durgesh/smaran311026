/** Stable id for a push endpoint (so re-registering the same browser updates one row). */
export function newIdFor(endpoint: string): string {
  let h = 5381
  for (let i = 0; i < endpoint.length; i++) h = ((h << 5) + h + endpoint.charCodeAt(i)) >>> 0
  return `dev_${h.toString(36)}_${endpoint.length}`
}
