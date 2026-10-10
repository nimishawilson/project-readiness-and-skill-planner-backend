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
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../generated/prisma/enums';
import { CreateSkillDto } from './dto/create-skill.dto';
import { SkillDto } from './dto/skill.dto';
import { UpdateSkillDto } from './dto/update-skill.dto';
import { SkillsService } from './skills.service';

@ApiTags('skills')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid token' })
@Controller('skills')
export class SkillsController {
  constructor(private readonly skills: SkillsService) {}

  @Get()
  @ApiOperation({ summary: 'List the skill catalog' })
  @ApiOkResponse({ type: [SkillDto] })
  list(): Promise<SkillDto[]> {
    return this.skills.list();
  }

  @Post()
  @Roles(Role.MANAGER)
  @ApiOperation({ summary: 'Add a skill to the catalog' })
  @ApiCreatedResponse({ type: SkillDto })
  @ApiBadRequestResponse({ description: 'Validation failed' })
  @ApiForbiddenResponse({ description: 'Managers only' })
  @ApiConflictResponse({ description: 'Skill name already exists' })
  create(@Body() dto: CreateSkillDto): Promise<SkillDto> {
    return this.skills.create(dto.name);
  }

  @Patch(':id')
  @Roles(Role.MANAGER)
  @ApiOperation({ summary: 'Rename a skill' })
  @ApiOkResponse({ type: SkillDto })
  @ApiBadRequestResponse({ description: 'Validation failed' })
  @ApiForbiddenResponse({ description: 'Managers only' })
  @ApiNotFoundResponse({ description: 'Skill not found' })
  @ApiConflictResponse({ description: 'Skill name already exists' })
  rename(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateSkillDto,
  ): Promise<SkillDto> {
    return this.skills.rename(id, dto.name);
  }

  @Delete(':id')
  @Roles(Role.MANAGER)
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete an unused skill' })
  @ApiNoContentResponse({ description: 'Skill deleted' })
  @ApiForbiddenResponse({ description: 'Managers only' })
  @ApiNotFoundResponse({ description: 'Skill not found' })
  @ApiConflictResponse({
    description: 'Skill is mapped to an employee or used in a requirement',
  })
  remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.skills.remove(id);
  }
}
