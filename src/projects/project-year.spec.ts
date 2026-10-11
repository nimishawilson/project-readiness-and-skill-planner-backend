import { NotFoundException } from '@nestjs/common';
import { currentYear } from '../common/utils/current-year';
import { resolveProjectYear } from './project-year';

describe('resolveProjectYear', () => {
  const year = currentYear();

  it('returns an explicit year that is mapped', () => {
    expect(resolveProjectYear([2020, year], 2020)).toBe(2020);
  });

  it('404s an explicit year that is not mapped', () => {
    expect(() => resolveProjectYear([year], 1999)).toThrow(NotFoundException);
  });

  it('defaults to the current year when mapped', () => {
    expect(resolveProjectYear([2020, year])).toBe(year);
  });

  it('falls back to the latest mapped year otherwise', () => {
    expect(resolveProjectYear([2020, 2022])).toBe(2022);
  });

  it('uses the current year when nothing is mapped', () => {
    expect(resolveProjectYear([])).toBe(year);
  });
});
