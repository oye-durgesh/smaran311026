import { lazy, type ComponentType, type LazyExoticComponent } from 'react'
import { SCREEN_META } from '../app/routes'

export interface ScreenProps { param?: string }
type Loader = () => Promise<{ default: ComponentType<ScreenProps> }>

const modules = import.meta.glob('./Screen*.tsx') as Record<string, Loader>

export const screenComponents: Record<string, LazyExoticComponent<ComponentType<ScreenProps>>> = Object.fromEntries(
  SCREEN_META.map((m) => [m.num, lazy(modules[`./Screen${m.num}.tsx`])]),
)
