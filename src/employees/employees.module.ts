import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { EmployeeSkillsModule } from '../employee-skills/employee-skills.module';
import { EmployeesController } from './employees.controller';
import { EmployeesService } from './employees.service';
import { MeController } from './me.controller';

@Module({
  imports: [AuthModule, EmployeeSkillsModule],
  controllers: [EmployeesController, MeController],
  providers: [EmployeesService],
  exports: [EmployeesService],
})
export class EmployeesModule {}
