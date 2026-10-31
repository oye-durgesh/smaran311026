// What the scheduler sends and whether it sends at all. Pure, so it is unit-tested.
export interface DueReminder { id: string; kind: string; title: string }
export interface Who { greeting_name: string | null; display_name: string | null; relationship: string; notifications_enabled: boolean }

/** false = the profile has notifications off: nothing is pushed, the reminder stays due in the app. */
export const shouldPush = (who: Who | null) => !(who && who.notifications_enabled === false)

export function buildPayload(r: DueReminder, who: Who | null) {
  const name = who && who.relationship !== 'self' ? (who.greeting_name || who.display_name || '') : ''
  return {
    reminderId: r.id,
    // No medicine names on lock screens. The profile name says whose reminder it is; a custom reminder shows the title the user typed.
    title: r.kind === 'medicine' ? (name ? `Time for ${name}'s medicine` : 'Time for your medicine') : (name ? `${name}: ${r.title}` : r.title),
    body: r.kind === 'medicine' ? 'Tap to answer Sathi' : 'Tap to open',
  }
}
