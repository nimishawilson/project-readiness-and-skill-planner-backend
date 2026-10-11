import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { LearningGoalView } from '../common/mappers/goal.mapper';
import type { AuthUser } from '../common/types/auth-user.type';
import { Role } from '../generated/prisma/enums';
import { CreateLearningGoalDto } from './dto/create-learning-goal.dto';
import { GoalsYearQueryDto } from './dto/goals-year-query.dto';
import { LearningGoalsService } from './learning-goals.service';

@ApiTags('learning-goals')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid token' })
@ApiForbiddenResponse({ description: 'Managers only, or not on your team' })
@Roles(Role.MANAGER)
@Controller('employees/:id/learning-goals')
export class EmployeeGoalsController {
  constructor(private readonly goals: LearningGoalsService) {}

  @Post()
  @ApiOperation({ summary: 'Assign a learning goal to a team member' })
  @ApiCreatedResponse({ type: LearningGoalView })
  @ApiBadRequestResponse({ description: 'Validation failed' })
  @ApiNotFoundResponse({ description: 'Employee not found' })
  @ApiConflictResponse({
    description: 'Employee already has 3 goals for the current year',
  })
  create(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateLearningGoalDto,
  ): Promise<LearningGoalView> {
    return this.goals.create(user.id, id, dto);
  }

  @Get()
  @ApiOperation({
    summary: "List a team member's learning goals for a year (default current)",
  })
  @ApiOkResponse({ type: [LearningGoalView] })
  @ApiBadRequestResponse({ description: 'Invalid year' })
  @ApiNotFoundResponse({ description: 'Employee not found' })
  list(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Query() query: GoalsYearQueryDto,
  ): Promise<LearningGoalView[]> {
    return this.goals.listForEmployee(user.id, id, query.year);
  }
}
