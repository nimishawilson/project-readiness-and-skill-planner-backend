import { Module } from '@nestjs/common';
import { SkillsModule } from '../skills/skills.module';
import { ProjectRequirementsController } from './project-requirements.controller';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';

@Module({
  imports: [SkillsModule],
  controllers: [ProjectsController, ProjectRequirementsController],
  providers: [ProjectsService],
  exports: [ProjectsService],
})
export class ProjectsModule {}
