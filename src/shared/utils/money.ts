export const toMinorUnits = (amount: number, fractionDigits = 2): number => {
  if (!Number.isFinite(amount)) {
    throw new Error('Amount must be a finite number');
  }
  const factor = 10 ** fractionDigits;
  return Math.round((amount + Number.EPSILON) * factor);
};

export const fromMinorUnits = (amount: number, fractionDigits = 2): number => {
  if (!Number.isFinite(amount)) {
    return 0;
  }
  const factor = 10 ** fractionDigits;
  return amount / factor;
};
