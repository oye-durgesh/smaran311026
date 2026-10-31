import type { FoodInstruction, Frequency } from '../types';

/** DEMO: what the simulated "Tell Sathi" medicine entry pretends to hear. */
export const SAMPLE_MED_VOICE: { heard: string; name: string; strength: string; dose: string; frequency: Frequency; food: FoodInstruction } = {
  heard: 'Metoprolol 50 milligram, ek tablet, subah khane ke baad',
  name: 'Metoprolol',
  strength: '50mg',
  dose: '1 tablet',
  frequency: 'Once daily',
  food: 'After food',
};
