export type FeeTier = 'free' | 'reduced_25' | 'reduced_50' | 'standard';

export function calculateFPL(
  annualIncome: number,
  householdSize: number
): { percentage: number; tier: FeeTier } {
  const FPL_BASE = 15650;
  const FPL_PER_PERSON = 5380;
  const poverty_line = FPL_BASE + (householdSize - 1) * FPL_PER_PERSON;
  const percentage = Math.round((annualIncome / poverty_line) * 100);

  const tier: FeeTier =
    percentage <= 100 ? 'free' :
    percentage <= 150 ? 'reduced_25' :
    percentage <= 200 ? 'reduced_50' :
    'standard';

  return { percentage, tier };
}
