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
import { MyProfileDto } from './dto/my-profile.dto';
import { EmployeesService } from './employees.service';

@ApiTags('me')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid token' })
@ApiForbiddenResponse({ description: 'Employees only' })
@Roles(Role.EMPLOYEE)
@Controller('me')
export class MeController {
  constructor(private readonly employees: EmployeesService) {}

  @Get('profile')
  @ApiOperation({ summary: 'Own profile with manager and skills' })
  @ApiOkResponse({ type: MyProfileDto })
  profile(@CurrentUser() user: AuthUser): Promise<MyProfileDto> {
    return this.employees.getMyProfile(user.id);
  }
}
