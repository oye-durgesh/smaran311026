/** Inline JSON Schema sent to Sarvam Document Intelligence Extract. Every field has type + description (API requirement). */
export const PRESCRIPTION_EXTRACT_SCHEMA = {
  type: 'object',
  properties: {
    patient_name: { type: 'string', description: 'Patient name as printed on the prescription. Empty string if not written or unreadable. Do not invent a name.' },
    doctor_name: { type: 'string', description: 'Prescribing doctor name as printed, including title if written. Empty string if not written or unreadable. Do not invent a name.' },
    prescription_date: { type: 'string', description: 'Date written on the prescription, copied as printed (any format). Empty string if not written. Do not invent a date.' },
    additional_instructions: { type: 'string', description: 'Advice or instructions that are not tied to a single medicine, as written. Empty string if none.' },
    unclear_or_missing: { type: 'string', description: 'Anything the document marks as unclear, illegible, or missing. Empty string if nothing is flagged.' },
    medicines: {
      type: 'array',
      description: 'One entry per medicine that is explicitly written. Do not invent medicines, strengths, or dosages.',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Medicine name as written. Empty string if unreadable. Do not invent a name.' },
          strength: { type: 'string', description: 'Strength as written (for example 500mg). Empty string if not written. Do not invent a strength.' },
          dosage: { type: 'string', description: 'Dose amount as written (for example 1 tablet). Empty string if not written. Do not invent a dose.' },
          frequency: { type: 'string', description: 'How often to take it as written (for example BD, twice daily, 1-0-1). Empty string if not written.' },
          intake_timing: { type: 'string', description: 'When to take it as written (clock times or morning/afternoon/evening/night). Empty string if not written. Do not invent clock times.' },
          food_instructions: { type: 'string', description: 'Before food, after food, or with food, only if written. Empty string if not written.' },
          duration: { type: 'string', description: 'Treatment duration as written (for example 5 days, continue). Empty string if not written.' },
          additional_instructions: { type: 'string', description: 'Other instructions for this medicine as written. Empty string if none.' },
          unclear_or_missing: { type: 'string', description: 'Unclear or missing details for this medicine as written. Empty string if none.' },
        },
      },
    },
  },
} as const
