// Type shim so the Edge Functions type-check with plain tsc in CI (the real runtime is Deno).
declare const Deno: { env: { get(k: string): string | undefined }; serve(h: (req: Request) => Response | Promise<Response>): void }
declare module 'npm:@supabase/supabase-js@2' { export * from '@supabase/supabase-js' }
declare module 'npm:web-push@3' { import wp from 'web-push'; export default wp }
declare module 'npm:fflate@0.8.3' { export * from 'fflate' }
