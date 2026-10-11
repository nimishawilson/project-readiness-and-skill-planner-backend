import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
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
import type { AuthUser } from '../common/types/auth-user.type';
import { Role } from '../generated/prisma/enums';
import { MapProjectYearDto } from './dto/map-project-year.dto';
import { ProjectViewDto } from './dto/project-view.dto';
import { ProjectYearSummaryDto } from './dto/project-year-summary.dto';
import { ProjectYearsService } from './project-years.service';

@ApiTags('project-years')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid token' })
@ApiForbiddenResponse({
  description: 'Managers only, or project owned by another manager',
})
@Roles(Role.MANAGER)
@Controller('projects/:id')
export class ProjectYearsController {
  constructor(private readonly years: ProjectYearsService) {}

  @Post('map-year')
  @HttpCode(200)
  @ApiOperation({
    summary:
      "Map a project to a new year, carrying the latest year's assignments forward",
  })
  @ApiOkResponse({ type: ProjectViewDto })
  @ApiBadRequestResponse({ description: 'Invalid year' })
  @ApiNotFoundResponse({ description: 'Project not found' })
  @ApiConflictResponse({
    description:
      'Already mapped, before the current year, or not after the latest mapped year',
  })
  mapYear(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: MapProjectYearDto,
  ): Promise<ProjectViewDto> {
    return this.years.mapYear(user.id, id, dto.year);
  }

  @Get('years')
  @ApiOperation({
    summary: 'Years a project is mapped to, with assigned counts',
  })
  @ApiOkResponse({ type: [ProjectYearSummaryDto] })
  @ApiNotFoundResponse({ description: 'Project not found' })
  list(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<ProjectYearSummaryDto[]> {
    return this.years.listYears(user.id, id);
  }
}
