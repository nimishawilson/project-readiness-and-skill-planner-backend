import {
  Body,
  Controller,
  Delete,
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
import { AddRequirementDto } from './dto/add-requirement.dto';
import { RequirementDto } from './dto/project-view.dto';
import { UpdateRequirementDto } from './dto/update-requirement.dto';
import { ProjectsService } from './projects.service';

@ApiTags('project-requirements')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid token' })
@ApiForbiddenResponse({
  description: 'Managers only, or project owned by another manager',
})
@Roles(Role.MANAGER)
@Controller('projects/:id/requirements')
export class ProjectRequirementsController {
  constructor(private readonly projects: ProjectsService) {}

  @Post()
  @ApiOperation({ summary: 'Add a skill requirement to a project' })
  @ApiCreatedResponse({ type: RequirementDto })
  @ApiBadRequestResponse({ description: 'Validation failed' })
  @ApiNotFoundResponse({ description: 'Project or skill not found' })
  @ApiConflictResponse({
    description: 'A requirement for this skill and level already exists',
  })
  add(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AddRequirementDto,
  ): Promise<RequirementDto> {
    return this.projects.addRequirement(user.id, id, dto);
  }

  @Patch(':requirementId')
  @ApiOperation({ summary: "Change a requirement's level or headcount" })
  @ApiOkResponse({ type: RequirementDto })
  @ApiBadRequestResponse({ description: 'Validation failed or empty body' })
  @ApiNotFoundResponse({ description: 'Project or requirement not found' })
  @ApiConflictResponse({
    description: 'Another requirement already has this skill and level',
  })
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Param('requirementId', ParseIntPipe) requirementId: number,
    @Body() dto: UpdateRequirementDto,
  ): Promise<RequirementDto> {
    return this.projects.updateRequirement(user.id, id, requirementId, dto);
  }

  @Delete(':requirementId')
  @HttpCode(204)
  @ApiOperation({ summary: 'Remove a requirement from a project' })
  @ApiNoContentResponse({ description: 'Requirement removed' })
  @ApiNotFoundResponse({ description: 'Project or requirement not found' })
  remove(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Param('requirementId', ParseIntPipe) requirementId: number,
  ): Promise<void> {
    return this.projects.removeRequirement(user.id, id, requirementId);
  }
}
