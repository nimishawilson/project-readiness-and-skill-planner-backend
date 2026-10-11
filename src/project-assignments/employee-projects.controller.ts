import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
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
import { EmployeeProjectDto } from './dto/employee-project.dto';
import { ProjectAssignmentsService } from './project-assignments.service';

@ApiTags('employee-projects')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid token' })
@ApiForbiddenResponse({ description: 'Managers only, or not on your team' })
@Roles(Role.MANAGER)
@Controller('employees/:id/projects')
export class EmployeeProjectsController {
  constructor(private readonly assignments: ProjectAssignmentsService) {}

  @Get()
  @ApiOperation({
    summary:
      'Your projects a team member is assigned to for a year (default: current)',
  })
  @ApiOkResponse({ type: [EmployeeProjectDto] })
  @ApiBadRequestResponse({ description: 'Invalid year' })
  @ApiNotFoundResponse({ description: 'Employee not found' })
  list(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Query() query: ProjectYearQueryDto,
  ): Promise<EmployeeProjectDto[]> {
    return this.assignments.listForEmployee(user.id, id, query.year);
  }
}
