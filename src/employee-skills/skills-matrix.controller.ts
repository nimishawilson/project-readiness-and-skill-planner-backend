import { Controller, Get, Query } from '@nestjs/common';
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
import { SkillsMatrixQueryDto } from './dto/skills-matrix-query.dto';
import { SkillsMatrixDto } from './dto/skills-matrix-response.dto';
import { EmployeeSkillsService } from './employee-skills.service';

@ApiTags('skills-matrix')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid token' })
@ApiForbiddenResponse({ description: 'Managers only' })
@Roles(Role.MANAGER)
@Controller('skills-matrix')
export class SkillsMatrixController {
  constructor(private readonly employeeSkills: EmployeeSkillsService) {}

  @Get()
  @ApiOperation({ summary: 'Skills matrix for the manager’s team' })
  @ApiOkResponse({ type: SkillsMatrixDto })
  @ApiBadRequestResponse({ description: 'Validation failed' })
  @ApiNotFoundResponse({ description: 'A requested skill was not found' })
  matrix(
    @CurrentUser() user: AuthUser,
    @Query() query: SkillsMatrixQueryDto,
  ): Promise<SkillsMatrixDto> {
    return this.employeeSkills.matrix(user.id, query);
  }
}
