import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { DepartmentsModule } from './departments/departments.module';
import { EmployeeSkillsModule } from './employee-skills/employee-skills.module';
import { EmployeesModule } from './employees/employees.module';
import { LearningGoalsModule } from './learning-goals/learning-goals.module';
import { ProjectsModule } from './projects/projects.module';
import { SkillsModule } from './skills/skills.module';
import { validateEnv } from './config/env.validation';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    PrismaModule,
    AuthModule,
    DepartmentsModule,
    EmployeesModule,
    EmployeeSkillsModule,
    LearningGoalsModule,
    ProjectsModule,
    SkillsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
