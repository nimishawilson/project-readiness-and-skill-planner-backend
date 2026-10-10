import { Type } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';

/** Builds a Swagger-visible `{ items, page, pageSize, total }` response class. */
export function PaginatedResponse<T>(itemType: Type<T>) {
  class PaginatedResponseClass {
    @ApiProperty({ type: [itemType] })
    items: T[];

    @ApiProperty({ example: 1 })
    page: number;

    @ApiProperty({ example: 20 })
    pageSize: number;

    @ApiProperty({ example: 57 })
    total: number;
  }
  Object.defineProperty(PaginatedResponseClass, 'name', {
    value: `Paginated${itemType.name}`,
  });
  return PaginatedResponseClass;
}
