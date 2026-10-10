import { Transform } from 'class-transformer';

/** Trims and lower-cases an email so duplicates can't differ by case. */
export const NormalizeEmail = () =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  );
