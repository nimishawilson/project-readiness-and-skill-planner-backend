import {
  Body,
  Controller,
  Delete,
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
import { AddEmployeeSkillDto } from './dto/add-employee-skill.dto';
import { EmployeeSkillDto } from './dto/employee-skill.dto';
import { UpdateEmployeeSkillDto } from './dto/update-employee-skill.dto';
import { EmployeeSkillsService } from './employee-skills.service';

@ApiTags('employee-skills')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid token' })
@ApiForbiddenResponse({ description: 'Managers only, or not on your team' })
@Roles(Role.MANAGER)
@Controller('employees/:id/skills')
export class EmployeeSkillsController {
  constructor(private readonly employeeSkills: EmployeeSkillsService) {}

  @Get()
  @ApiOperation({ summary: "List a team member's skills" })
  @ApiOkResponse({ type: [EmployeeSkillDto] })
  @ApiNotFoundResponse({ description: 'Employee not found' })
  list(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<EmployeeSkillDto[]> {
    return this.employeeSkills.list(user.id, id);
  }

  @Post()
  @ApiOperation({ summary: 'Add a skill to a team member' })
  @ApiCreatedResponse({ type: EmployeeSkillDto })
  @ApiBadRequestResponse({ description: 'Validation failed' })
  @ApiNotFoundResponse({ description: 'Employee or skill not found' })
  @ApiConflictResponse({ description: 'Employee already has this skill' })
  add(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AddEmployeeSkillDto,
  ): Promise<EmployeeSkillDto> {
    return this.employeeSkills.add(user.id, id, dto.skillId, dto.level);
  }

  @Patch(':skillId')
  @ApiOperation({ summary: "Edit a team member's proficiency level" })
  @ApiOkResponse({ type: EmployeeSkillDto })
  @ApiBadRequestResponse({ description: 'Validation failed' })
  @ApiNotFoundResponse({
    description: 'Employee not found, or employee does not have this skill',
  })
  updateLevel(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Param('skillId', ParseIntPipe) skillId: number,
    @Body() dto: UpdateEmployeeSkillDto,
  ): Promise<EmployeeSkillDto> {
    return this.employeeSkills.updateLevel(user.id, id, skillId, dto.level);
  }

  @Delete(':skillId')
  @HttpCode(204)
  @ApiOperation({ summary: 'Remove a skill from a team member' })
  @ApiNoContentResponse({ description: 'Skill mapping removed' })
  @ApiNotFoundResponse({
    description: 'Employee not found, or employee does not have this skill',
  })
  remove(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Param('skillId', ParseIntPipe) skillId: number,
  ): Promise<void> {
    return this.employeeSkills.remove(user.id, id, skillId);
  }
}
