export const isMinorUnits = (amount: number): boolean =>
  Number.isFinite(amount) && Number.isInteger(amount);

export const warnIfNotMinorUnits = (amount: number | undefined, context: string): void => {
  if (typeof amount !== 'number') return;
  if (!isMinorUnits(amount)) {
    console.warn(`[money] Expected integer minor units for ${context}.`, amount);
  }
};
