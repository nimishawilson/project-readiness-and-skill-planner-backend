import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TeamAccessService {
  constructor(private readonly prisma: PrismaService) {}

  /** 404 if the employee doesn't exist, 403 if they aren't on the manager's team. */
  async assertTeamMember(managerId: number, employeeId: number): Promise<void> {
    const employee = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      select: { managerId: true },
    });
    if (!employee) throw new NotFoundException('Employee not found');
    if (employee.managerId !== managerId) {
      throw new ForbiddenException('Employee is not on your team');
    }
  }
}
