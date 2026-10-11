import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { EmployeeGoalsController } from './employee-goals.controller';
import { LearningGoalsController } from './learning-goals.controller';
import { LearningGoalsService } from './learning-goals.service';

@Module({
  imports: [AuthModule],
  controllers: [EmployeeGoalsController, LearningGoalsController],
  providers: [LearningGoalsService],
  exports: [LearningGoalsService],
})
export class LearningGoalsModule {}
