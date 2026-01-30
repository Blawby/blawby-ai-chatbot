export type MajorAmount = number & { readonly __brand: 'MajorAmount' };
export type MinorAmount = number & { readonly __brand: 'MinorAmount' };

export const asMajor = (amount: number): MajorAmount => amount as MajorAmount;
export const asMinor = (amount: number): MinorAmount => amount as MinorAmount;

const isDev =
  typeof import.meta !== 'undefined' &&
  typeof import.meta.env !== 'undefined' &&
  Boolean(import.meta.env.DEV);

export const assertMajorUnits = (amount: number, context?: string): void => {
  if (!isDev) return;
  if (!Number.isFinite(amount)) {
    throw new Error(`[money] Expected finite major units${context ? ` for ${context}` : ''}.`);
  }
};

export const assertMinorUnits = (amount: number, context?: string): void => {
  if (!isDev) return;
  if (!Number.isFinite(amount) || !Number.isInteger(amount)) {
    throw new Error(`[money] Expected integer minor units${context ? ` for ${context}` : ''}.`);
  }
};

export const toMinorUnits = (amount: number, fractionDigits = 2): MinorAmount => {
  assertMajorUnits(amount, 'toMinorUnits');
  if (!Number.isFinite(amount)) {
    throw new Error('Amount must be a finite number');
  }
  const factor = 10 ** fractionDigits;
  const sign = amount < 0 ? -1 : 1;
  return asMinor(sign * Math.round((Math.abs(amount) + Number.EPSILON) * factor));
};

export const fromMinorUnits = (amount: number, fractionDigits = 2): MajorAmount => {
  assertMinorUnits(amount, 'fromMinorUnits');
  if (!Number.isFinite(amount)) {
    throw new Error('Amount must be a finite number');
  }
  const factor = 10 ** fractionDigits;
  return asMajor(amount / factor);
};

export const toMajorUnits = (
  value: number | null | undefined,
  fractionDigits = 2
): MajorAmount | null | undefined => {
  if (typeof value !== 'number') {
    return value;
  }
  assertMinorUnits(value, 'toMajorUnits');
  return fromMinorUnits(value, fractionDigits);
};

export const toMinorUnitsValue = (
  value: number | null | undefined,
  fractionDigits = 2
): MinorAmount | null | undefined => {
  if (typeof value !== 'number') {
    return value;
  }
  assertMajorUnits(value, 'toMinorUnitsValue');
  return toMinorUnits(value, fractionDigits);
};
