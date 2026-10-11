import { Controller, Get } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import type { AuthUser } from '../common/types/auth-user.type';
import { Role } from '../generated/prisma/enums';
import { MySkillItemDto } from '../employee-skills/dto/my-skill.dto';
import { EmployeeSkillsService } from '../employee-skills/employee-skills.service';
import { MyProfileDto } from './dto/my-profile.dto';
import { EmployeesService } from './employees.service';

@ApiTags('me')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid token' })
@ApiForbiddenResponse({ description: 'Employees only' })
@Roles(Role.EMPLOYEE)
@Controller('me')
export class MeController {
  constructor(
    private readonly employees: EmployeesService,
    private readonly employeeSkills: EmployeeSkillsService,
  ) {}

  @Get('profile')
  @ApiOperation({ summary: 'Own profile with manager and skills' })
  @ApiOkResponse({ type: MyProfileDto })
  profile(@CurrentUser() user: AuthUser): Promise<MyProfileDto> {
    return this.employees.getMyProfile(user.id);
  }

  @Get('skills')
  @ApiOperation({ summary: 'Own skills and proficiency levels (read-only)' })
  @ApiOkResponse({ type: [MySkillItemDto] })
  skills(@CurrentUser() user: AuthUser): Promise<MySkillItemDto[]> {
    return this.employeeSkills.listMine(user.id);
  }
}
