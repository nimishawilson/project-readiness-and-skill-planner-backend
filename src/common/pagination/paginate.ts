export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

export function skipTake({
  page,
  pageSize,
}: {
  page: number;
  pageSize: number;
}) {
  return { skip: (page - 1) * pageSize, take: pageSize };
}

export function toPage<T>(
  items: T[],
  total: number,
  { page, pageSize }: { page: number; pageSize: number },
): Paginated<T> {
  return { items, page, pageSize, total };
}
