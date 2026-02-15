export type FeeTier = 'free' | 'reduced_25' | 'reduced_50' | 'standard';

export function calculateFPL(
  annualIncome: number,
  householdSize: number
): { percentage: number; tier: FeeTier } {
  // Validate inputs
  if (!Number.isInteger(householdSize) || householdSize < 1) {
    throw new RangeError('householdSize must be an integer >= 1');
  }
  if (!Number.isFinite(annualIncome) || annualIncome < 0) {
    throw new RangeError('annualIncome must be a number >= 0');
  }

  // 2025 HHS Poverty Guidelines, contiguous U.S. only
  // TODO: Add support for Alaska and Hawaii special rates.
  // FPL values are updated annually and should be reviewed each year.
  const FPL_BASE = 15650;
  const FPL_PER_PERSON = 5500;
  const poverty_line = FPL_BASE + (householdSize - 1) * FPL_PER_PERSON;
  const percentage = Math.round((annualIncome / poverty_line) * 100);

  const tier: FeeTier =
    percentage <= 100 ? 'free' :
    percentage <= 150 ? 'reduced_25' :
    percentage <= 200 ? 'reduced_50' :
    'standard';

  return { percentage, tier };
}
