import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
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
import { Paginated } from '../common/pagination/paginate';
import { PaginatedResponse } from '../common/pagination/paginated-response';
import type { AuthUser } from '../common/types/auth-user.type';
import { Role } from '../generated/prisma/enums';
import { CreateProjectDto } from './dto/create-project.dto';
import { ListProjectsQueryDto } from './dto/list-projects-query.dto';
import { ProjectYearQueryDto } from './dto/project-year-query.dto';
import {
  ProjectDetailDto,
  ProjectListItemDto,
  ProjectViewDto,
} from './dto/project-view.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { ProjectsService } from './projects.service';

class PaginatedProjectsDto extends PaginatedResponse(ProjectListItemDto) {}

@ApiTags('projects')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid token' })
@ApiForbiddenResponse({
  description: 'Managers only, or project owned by another manager',
})
@Roles(Role.MANAGER)
@Controller('projects')
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Post()
  @ApiOperation({
    summary: 'Create a project (private to you), optionally with requirements',
  })
  @ApiCreatedResponse({ type: ProjectViewDto })
  @ApiBadRequestResponse({
    description: 'Validation failed or duplicate requirement',
  })
  @ApiNotFoundResponse({ description: 'A requirement skill was not found' })
  create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateProjectDto,
  ): Promise<ProjectViewDto> {
    return this.projects.create(user.id, dto);
  }

  @Get()
  @ApiOperation({
    summary: 'Your projects mapped to a year, with readiness and headcount',
  })
  @ApiOkResponse({ type: PaginatedProjectsDto })
  @ApiBadRequestResponse({ description: 'Invalid query' })
  list(
    @CurrentUser() user: AuthUser,
    @Query() query: ListProjectsQueryDto,
  ): Promise<Paginated<ProjectListItemDto>> {
    return this.projects.list(user.id, query);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Project details: assigned employees and remaining headcount',
  })
  @ApiOkResponse({ type: ProjectDetailDto })
  @ApiBadRequestResponse({ description: 'Invalid year' })
  @ApiNotFoundResponse({
    description: 'Project not found, or not mapped to the requested year',
  })
  get(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Query() query: ProjectYearQueryDto,
  ): Promise<ProjectDetailDto> {
    return this.projects.get(user.id, id, query.year);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Edit a project name or description' })
  @ApiOkResponse({ type: ProjectViewDto })
  @ApiBadRequestResponse({ description: 'Validation failed or empty body' })
  @ApiNotFoundResponse({ description: 'Project not found' })
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateProjectDto,
  ): Promise<ProjectViewDto> {
    return this.projects.update(user.id, id, dto);
  }
}
