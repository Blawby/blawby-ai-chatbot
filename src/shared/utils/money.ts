export const toMinorUnits = (amount: number, fractionDigits = 2): number => {
  if (!Number.isFinite(amount)) {
    throw new Error('Amount must be a finite number');
  }
  const factor = 10 ** fractionDigits;
  const sign = amount < 0 ? -1 : 1;
  return sign * Math.round((Math.abs(amount) + Number.EPSILON) * factor);
};

export const fromMinorUnits = (amount: number, fractionDigits = 2): number => {
  if (!Number.isFinite(amount)) {
    throw new Error('Amount must be a finite number');
  }
  const factor = 10 ** fractionDigits;
  return amount / factor;
};
