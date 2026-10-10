import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { EmployeesController } from './employees.controller';
import { EmployeesService } from './employees.service';
import { MeController } from './me.controller';

@Module({
  imports: [AuthModule],
  controllers: [EmployeesController, MeController],
  providers: [EmployeesService],
  exports: [EmployeesService],
})
export class EmployeesModule {}
