import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SkillsModule } from '../skills/skills.module';
import { EmployeeSkillsController } from './employee-skills.controller';
import { EmployeeSkillsService } from './employee-skills.service';
import { SkillsMatrixController } from './skills-matrix.controller';

@Module({
  imports: [AuthModule, SkillsModule],
  controllers: [EmployeeSkillsController, SkillsMatrixController],
  providers: [EmployeeSkillsService],
  exports: [EmployeeSkillsService],
})
export class EmployeeSkillsModule {}
