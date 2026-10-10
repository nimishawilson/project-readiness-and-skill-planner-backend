import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DepartmentDto } from './dto/department.dto';

@Injectable()
export class DepartmentsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(): Promise<DepartmentDto[]> {
    return this.prisma.department.findMany({
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
  }
}
