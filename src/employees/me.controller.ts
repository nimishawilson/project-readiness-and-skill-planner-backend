import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiNotFoundResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import type { AuthUser } from '../common/types/auth-user.type';
import { Role } from '../generated/prisma/enums';
import { MySkillItemDto } from '../employee-skills/dto/my-skill.dto';
import { EmployeeSkillsService } from '../employee-skills/employee-skills.service';
import { LearningGoalView } from '../common/mappers/goal.mapper';
import { GoalsYearQueryDto } from '../learning-goals/dto/goals-year-query.dto';
import { UpdateMyGoalProgressDto } from '../learning-goals/dto/update-my-goal-progress.dto';
import { LearningGoalsService } from '../learning-goals/learning-goals.service';
import { MyProfileDto } from './dto/my-profile.dto';
import { EmployeesService } from './employees.service';

@ApiTags('me')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid token' })
@ApiForbiddenResponse({ description: 'Employees only' })
@Roles(Role.EMPLOYEE)
@Controller('me')
export class MeController {
  constructor(
    private readonly employees: EmployeesService,
    private readonly employeeSkills: EmployeeSkillsService,
    private readonly goals: LearningGoalsService,
  ) {}

  @Get('profile')
  @ApiOperation({ summary: 'Own profile with manager and skills' })
  @ApiOkResponse({ type: MyProfileDto })
  profile(@CurrentUser() user: AuthUser): Promise<MyProfileDto> {
    return this.employees.getMyProfile(user.id);
  }

  @Get('skills')
  @ApiOperation({ summary: 'Own skills and proficiency levels (read-only)' })
  @ApiOkResponse({ type: [MySkillItemDto] })
  skills(@CurrentUser() user: AuthUser): Promise<MySkillItemDto[]> {
    return this.employeeSkills.listMine(user.id);
  }

  @Get('learning-goals')
  @ApiOperation({
    summary: 'Own learning goals for a year (default current)',
  })
  @ApiOkResponse({ type: [LearningGoalView] })
  @ApiBadRequestResponse({ description: 'Invalid year' })
  learningGoals(
    @CurrentUser() user: AuthUser,
    @Query() query: GoalsYearQueryDto,
  ): Promise<LearningGoalView[]> {
    return this.goals.listMine(user.id, query.year);
  }

  @Patch('learning-goals/:id/progress')
  @ApiOperation({
    summary:
      'Advance own goal progress (not started -> in progress -> completed)',
  })
  @ApiOkResponse({ type: LearningGoalView })
  @ApiBadRequestResponse({ description: 'Validation failed' })
  @ApiNotFoundResponse({ description: 'Goal not found or not yours' })
  @ApiConflictResponse({ description: 'Transition not allowed' })
  advanceProgress(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateMyGoalProgressDto,
  ): Promise<LearningGoalView> {
    return this.goals.advanceMyProgress(user.id, id, dto.progressStatus);
  }
}
