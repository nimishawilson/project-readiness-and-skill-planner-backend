import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ProjectsModule } from '../projects/projects.module';
import { EmployeeProjectsController } from './employee-projects.controller';
import { ProjectAssignmentsController } from './project-assignments.controller';
import { ProjectAssignmentsService } from './project-assignments.service';

@Module({
  imports: [AuthModule, ProjectsModule],
  controllers: [ProjectAssignmentsController, EmployeeProjectsController],
  providers: [ProjectAssignmentsService],
  exports: [ProjectAssignmentsService],
})
export class ProjectAssignmentsModule {}
