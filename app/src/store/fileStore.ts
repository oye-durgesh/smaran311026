/** Original prescription files live in IndexedDB (localStorage is too small); state keeps only metadata. */
const DB = 'smaran-files'
const OS = 'files'

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('IndexedDB unavailable'))
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(OS)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}
async function tx<T>(mode: IDBTransactionMode, run: (os: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open()
  return new Promise((resolve, reject) => {
    const t = db.transaction(OS, mode)
    const r = run(t.objectStore(OS))
    r.onsuccess = () => resolve(r.result)
    r.onerror = () => reject(r.error)
  })
}
export const fileStore = {
  put: (key: string, blob: Blob) => tx('readwrite', (os) => os.put(blob, key)).then(() => undefined),
  get: (key: string) => tx<Blob | undefined>('readonly', (os) => os.get(key)),
  del: (key: string) => tx('readwrite', (os) => os.delete(key)).then(() => undefined),
  clear: () => tx('readwrite', (os) => os.clear()).then(() => undefined),
}
