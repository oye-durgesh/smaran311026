/** Central screen map: every one of the 48 screens, its section, its fallback "back" target and its tab. */
export type Tab = 'home' | 'medicines' | 'health' | 'more' | null

export interface ScreenMeta {
  num: string
  title: string
  section: string
  lightChrome?: boolean
  /** Where Back goes when there is no in-app history (e.g. after a refresh on a deep link). */
  parent?: string
  tab?: Tab
}

const S = (num: string, title: string, section: string, extra: Partial<ScreenMeta> = {}): ScreenMeta => ({ num, title, section, ...extra })

export const SCREEN_META: ScreenMeta[] = [
  S('01', 'Welcome', 'Onboarding & Account'),
  S('02', 'Account setup', 'Onboarding & Account', { parent: '01' }),
  S('03', 'Language', 'Onboarding & Account', { parent: '02' }),
  S('04', 'Personalization', 'Onboarding & Account', { parent: '03' }),
  S('05', 'Profile', 'Onboarding & Account', { parent: '04' }),
  S('49', 'Who are you helping', 'Family Profiles', { parent: '05' }),
  S('50', 'Family profile', 'Family Profiles', { tab: 'home', parent: '14' }),
  S('51', 'Join a family', 'Family Profiles', { parent: '01' }),
  S('06', 'Notifications', 'Permissions', { parent: '05' }),
  S('07', 'Microphone', 'Permissions', { parent: '06' }),
  S('08', 'Upload prescription', 'Medicine Setup', { parent: '30' }),
  S('09', 'Processing', 'Medicine Setup', { parent: '08' }),
  S('10', 'Review medicines', 'Medicine Setup', { parent: '08' }),
  S('11', 'Schedule config', 'Medicine Setup', { parent: '10' }),
  S('12', 'Finalization', 'Medicine Setup', { parent: '10' }),
  S('13', 'Home · Setup needed', 'Home & Navigation', { tab: 'home' }),
  S('14', 'Home · Active', 'Home & Navigation', { tab: 'home' }),
  S('15', 'Medicines list', 'Home & Navigation', { tab: 'medicines', parent: '14' }),
  S('16', 'Home · Missed', 'Home & Navigation', { tab: 'home' }),
  S('17', 'Incoming call', 'Voice Calls', { lightChrome: true, parent: '14' }),
  S('18', 'Active conversation', 'Voice Calls', { lightChrome: true, parent: '14' }),
  S('19', 'Call complete', 'Voice Calls', { parent: '14' }),
  S('20', 'Health home', 'Health Logging', { tab: 'health' }),
  S('21', 'Blood sugar', 'Health Logging', { parent: '20' }),
  S('22', 'Blood pressure', 'Health Logging', { parent: '20' }),
  S('23', 'Health history', 'Health Logging', { tab: 'health', parent: '20' }),
  S('24', 'Family space', 'Family & Settings', { parent: '26' }),
  S('25', 'Appointments', 'Family & Settings', { tab: 'more', parent: '26' }),
  S('26', 'Settings', 'Family & Settings', { tab: 'more' }),
  S('27', 'Empty · Health', 'Empty & Error States', { tab: 'health', parent: '20' }),
  S('28', 'Error states', 'Empty & Error States', { parent: '08' }),
  S('29', 'Medicine detail', 'Empty & Error States', { parent: '15' }),
  S('30', 'Medicine setup landing', 'Medicine Management (Extended)', { tab: 'medicines', parent: '15' }),
  S('31', 'Add manually', 'Medicine Management (Extended)', { parent: '30' }),
  S('32', 'Edit / pause medicine', 'Medicine Management (Extended)', { parent: '15' }),
  S('33', 'Setup complete', 'Medicine Management (Extended)'),
  S('34', 'Connecting', 'Voice States (Extended)', { lightChrome: true, parent: '14' }),
  S('35', 'Listening', 'Voice States (Extended)', { lightChrome: true, parent: '14' }),
  S('36', 'Sathi speaking', 'Voice States (Extended)', { lightChrome: true, parent: '14' }),
  S('37', 'Reconnecting', 'Voice States (Extended)', { lightChrome: true, parent: '14' }),
  S('38', 'Voice health entry', 'Health (Extended)', { parent: '20' }),
  S('39', 'Invalid / ambiguous', 'Health (Extended)', { parent: '38' }),
  S('40', 'Reading saved', 'Health (Extended)', { parent: '20' }),
  S('41', 'Invite family', 'Family (Extended)', { parent: '24' }),
  S('42', 'Remote setup', 'Family (Extended)', { parent: '24' }),
  S('43', 'Parent confirmation', 'Family (Extended)', { parent: '24' }),
  S('44', 'Privacy & data', 'Family (Extended)', { tab: 'more', parent: '26' }),
  S('45', 'Partial extraction', 'Additional States', { parent: '08' }),
  S('46', "Today's reminders", 'Additional States', { tab: 'home', parent: '14' }),
  S('47', 'Help & support', 'Additional States', { tab: 'more', parent: '26' }),
  S('48', 'Notification permission', 'Additional States', { tab: 'more', parent: '26' }),
]

export const META: Record<string, ScreenMeta> = Object.fromEntries(SCREEN_META.map((m) => [m.num, m]))

export interface Route { num: string; param?: string }

export function parseHash(hash: string): Route | null {
  const h = hash.replace(/^#/, '')
  const join = /^join\/([A-Za-z0-9]{6,40})$/.exec(h)   // invitation links look like #join/<code>
  if (join) return { num: '51', param: join[1] }
  const m = /^(\d{2})(?:\/(.+))?$/.exec(h)
  if (!m || !META[m[1]]) return null
  return { num: m[1], param: m[2] ? decodeURIComponent(m[2]) : undefined }
}
export const routeToHash = (r: Route) => `#${r.num}${r.param ? '/' + encodeURIComponent(r.param) : ''}`
export const routeKey = (r: Route) => routeToHash(r)
