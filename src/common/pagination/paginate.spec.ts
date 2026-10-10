import { skipTake, toPage } from './paginate';

describe('pagination helpers', () => {
  it('computes skip/take from page and pageSize', () => {
    expect(skipTake({ page: 3, pageSize: 20 })).toEqual({ skip: 40, take: 20 });
  });

  it('wraps items with metadata', () => {
    expect(toPage(['a'], 57, { page: 1, pageSize: 20 })).toEqual({
      items: ['a'],
      page: 1,
      pageSize: 20,
      total: 57,
    });
  });
});
