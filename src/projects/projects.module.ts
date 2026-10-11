import { Module } from '@nestjs/common';
import { SkillsModule } from '../skills/skills.module';
import { ProjectRequirementsController } from './project-requirements.controller';
import { ProjectYearsController } from './project-years.controller';
import { ProjectYearsService } from './project-years.service';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';

@Module({
  imports: [SkillsModule],
  controllers: [
    ProjectsController,
    ProjectRequirementsController,
    ProjectYearsController,
  ],
  providers: [ProjectsService, ProjectYearsService],
  exports: [ProjectsService],
})
export class ProjectsModule {}
