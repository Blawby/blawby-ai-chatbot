import { fromMinorUnits, toMinorUnits } from '@/shared/utils/money';

export const toMajorUnits = (value: number | null | undefined): number | null | undefined => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return value;
  }
  return fromMinorUnits(value);
};

export const toMinorUnitsValue = (value: number | null | undefined): number | null | undefined => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return value;
  }
  return toMinorUnits(value);
};
