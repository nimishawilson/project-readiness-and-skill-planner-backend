import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
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
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import type { AuthUser } from '../common/types/auth-user.type';
import { Role } from '../generated/prisma/enums';
import { ProjectYearQueryDto } from '../projects/dto/project-year-query.dto';
import { AssignedEmployeeDto } from '../projects/dto/project-view.dto';
import { AssignEmployeeDto } from './dto/assign-employee.dto';
import { CreatedAssignmentDto } from './dto/created-assignment.dto';
import { ProjectAssignmentsService } from './project-assignments.service';

@ApiTags('project-assignments')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid token' })
@ApiForbiddenResponse({
  description:
    'Managers only, project owned by another manager, or employee not on your team',
})
@Roles(Role.MANAGER)
@Controller('projects/:id/assignments')
export class ProjectAssignmentsController {
  constructor(private readonly assignments: ProjectAssignmentsService) {}

  @Get()
  @ApiOperation({
    summary:
      'Employees assigned to a project for a year (default: current, else latest mapped)',
  })
  @ApiOkResponse({ type: [AssignedEmployeeDto] })
  @ApiBadRequestResponse({ description: 'Invalid year' })
  @ApiNotFoundResponse({
    description: 'Project not found, or not mapped to the requested year',
  })
  list(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Query() query: ProjectYearQueryDto,
  ): Promise<AssignedEmployeeDto[]> {
    return this.assignments.list(user.id, id, query.year);
  }

  @Post()
  @ApiOperation({
    summary: 'Assign a team member to a project (current year only)',
  })
  @ApiCreatedResponse({ type: CreatedAssignmentDto })
  @ApiBadRequestResponse({ description: 'Validation failed' })
  @ApiNotFoundResponse({ description: 'Project or employee not found' })
  @ApiConflictResponse({
    description:
      'Already assigned, project not mapped to the current year, or year is not the current year',
  })
  assign(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AssignEmployeeDto,
  ): Promise<CreatedAssignmentDto> {
    return this.assignments.assign(user.id, id, dto);
  }

  @Delete(':employeeId')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Remove an employee from a project (current year only)',
  })
  @ApiNoContentResponse({ description: 'Assignment removed' })
  @ApiBadRequestResponse({ description: 'Invalid year' })
  @ApiNotFoundResponse({
    description: 'Project not found, or employee not assigned',
  })
  @ApiConflictResponse({ description: 'Year is not the current year' })
  unassign(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Param('employeeId', ParseIntPipe) employeeId: number,
    @Query() query: ProjectYearQueryDto,
  ): Promise<void> {
    return this.assignments.unassign(user.id, id, employeeId, query.year);
  }
}
