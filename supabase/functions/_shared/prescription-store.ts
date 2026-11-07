import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { parseConfirmRpc, type ConfirmAtomicInput, type ConfirmResult, type PrescriptionConfirmStore } from './prescription-confirm.ts'

export function supabasePrescriptionStore(db: SupabaseClient): PrescriptionConfirmStore {
  return {
    async confirmAtomic(input: ConfirmAtomicInput): Promise<ConfirmResult> {
      const { data, error } = await db.rpc('confirm_prescription_medicines', {
        p_prescription_id: input.prescriptionId,
        p_family_member_id: input.memberId,
        p_medicines: input.medicines,
        p_prescriber: input.prescriber ?? null,
      })
      if (error) {
        const msg = error.message || ''
        if (/permission|row-level|not authorized/i.test(msg)) {
          return { ok: false, code: 'permission_denied', message: 'You cannot manage medicines for that family member.' }
        }
        return { ok: false, code: 'unavailable', message: 'Saving the schedule failed. No medicines or reminders were left half-created.' }
      }
      return parseConfirmRpc(data)
    },
  }
}
