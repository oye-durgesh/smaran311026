/// <reference types="vite/client" />
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
  readonly VITE_SUPPORT_EMAIL?: string
  readonly VITE_SHOW_SCREEN_MENU?: string
  readonly VITE_VAPID_PUBLIC_KEY?: string
  readonly VITE_LOCAL_API?: string
}
interface ImportMeta { readonly env: ImportMetaEnv }
