import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { reminderUpsertPayload, type MedRow, type MedicineStore, type MemberRow, type RemRow } from './medicine-tools.ts'

export function supabaseMedicineStore(db: SupabaseClient): MedicineStore {
  return {
    async getMember(ownerId, memberId) {
      const { data, error } = await db.from('family_members')
        .select('id, owner_id, relationship, active, language, time_zone, display_name')
        .eq('owner_id', ownerId)
        .eq('id', memberId)
        .maybeSingle()
      if (error) throw error
      return (data ?? null) as MemberRow | null
    },
    async listMedicines(ownerId, memberId) {
      const { data, error } = await db.from('medicines')
        .select('id, owner_id, family_member_id, name, strength, dose, frequency, times, food, status, start_date, end_date')
        .eq('owner_id', ownerId)
        .eq('family_member_id', memberId)
      if (error) throw error
      return (data ?? []) as MedRow[]
    },
    async getMedicine(ownerId, id) {
      const { data, error } = await db.from('medicines')
        .select('id, owner_id, family_member_id, name, strength, dose, frequency, times, food, status, start_date, end_date')
        .eq('owner_id', ownerId)
        .eq('id', id)
        .maybeSingle()
      if (error) throw error
      return (data ?? null) as MedRow | null
    },
    async listReminders(ownerId, memberId, fromIso, toIso) {
      const { data, error } = await db.from('member_reminders')
        .select('id, owner_id, family_member_id, medicine_id, scheduled_for, original_scheduled_for, time_zone, status, title, snooze_history, completed_at, skipped_at, completion, idempotency_key')
        .eq('owner_id', ownerId)
        .eq('family_member_id', memberId)
        .gte('scheduled_for', fromIso)
        .lte('scheduled_for', toIso)
      if (error) throw error
      return (data ?? []) as RemRow[]
    },
    async getReminder(ownerId, id) {
      const { data, error } = await db.from('member_reminders')
        .select('id, owner_id, family_member_id, medicine_id, scheduled_for, original_scheduled_for, time_zone, status, title, snooze_history, completed_at, skipped_at, completion, idempotency_key')
        .eq('owner_id', ownerId)
        .eq('id', id)
        .maybeSingle()
      if (error) throw error
      return (data ?? null) as RemRow | null
    },
    async upsertReminder(row) {
      const { data, error } = await db.from('member_reminders').upsert(reminderUpsertPayload(row)).select('*').single()
      if (error) throw error
      return data as RemRow
    },
  }
}
