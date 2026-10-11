import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
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
import { MapGoalYearDto } from './dto/map-goal-year.dto';
import { UpdateLearningGoalDto } from './dto/update-learning-goal.dto';
import { LearningGoalsService } from './learning-goals.service';

@ApiTags('learning-goals')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid token' })
@ApiForbiddenResponse({ description: 'Managers only, or not on your team' })
@Roles(Role.MANAGER)
@Controller('learning-goals')
export class LearningGoalsController {
  constructor(private readonly goals: LearningGoalsService) {}

  // Declared before any ':id' route.
  @Get('pending-approval')
  @ApiOperation({
    summary: 'Team goals completed by employees and awaiting approval',
  })
  @ApiOkResponse({ type: [LearningGoalView] })
  pendingApproval(@CurrentUser() user: AuthUser): Promise<LearningGoalView[]> {
    return this.goals.pendingApproval(user.id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: "Edit a team member's goal or change its progress status",
  })
  @ApiOkResponse({ type: LearningGoalView })
  @ApiBadRequestResponse({ description: 'Validation failed or empty body' })
  @ApiNotFoundResponse({ description: 'Goal not found' })
  @ApiConflictResponse({ description: 'Goal is already approved (locked)' })
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateLearningGoalDto,
  ): Promise<LearningGoalView> {
    return this.goals.update(user.id, id, dto);
  }

  @Post(':id/approve')
  @HttpCode(200)
  @ApiOperation({ summary: 'Approve a completed goal' })
  @ApiOkResponse({ type: LearningGoalView })
  @ApiNotFoundResponse({ description: 'Goal not found' })
  @ApiConflictResponse({
    description: 'Goal is not completed, or is already approved',
  })
  approve(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<LearningGoalView> {
    return this.goals.approve(user.id, id);
  }

  @Post(':id/map-year')
  @HttpCode(200)
  @ApiOperation({ summary: 'Move a goal to another year' })
  @ApiOkResponse({ type: LearningGoalView })
  @ApiBadRequestResponse({ description: 'Invalid year' })
  @ApiNotFoundResponse({ description: 'Goal not found' })
  @ApiConflictResponse({
    description: 'Target year already has 3 goals for that employee',
  })
  mapYear(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: MapGoalYearDto,
  ): Promise<LearningGoalView> {
    return this.goals.mapYear(user.id, id, dto.year);
  }
}
