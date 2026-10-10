import { Transform } from 'class-transformer';

/** Trims and collapses runs of whitespace into single spaces. */
export const NormalizeText = () =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value,
  );
