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
  ApiConflictResponse,
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
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { EmployeeListItemDto } from './dto/employee-list-item.dto';
import { EmployeeProfileDto } from './dto/employee-profile.dto';
import { ListEmployeesQueryDto } from './dto/list-employees-query.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { EmployeesService } from './employees.service';

class PaginatedEmployeesDto extends PaginatedResponse(EmployeeListItemDto) {}

@ApiTags('employees')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid token' })
@ApiForbiddenResponse({ description: 'Not a manager / not your team' })
@Roles(Role.MANAGER)
@Controller('employees')
export class EmployeesController {
  constructor(private readonly employees: EmployeesService) {}

  @Get()
  @ApiOperation({ summary: 'Employee directory (own team only)' })
  @ApiOkResponse({ type: PaginatedEmployeesDto })
  @ApiBadRequestResponse({ description: 'Invalid query' })
  list(
    @CurrentUser() user: AuthUser,
    @Query() query: ListEmployeesQueryDto,
  ): Promise<Paginated<EmployeeListItemDto>> {
    return this.employees.list(user.id, query);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Employee profile with skills and current-year learning goals',
  })
  @ApiOkResponse({ type: EmployeeProfileDto })
  @ApiNotFoundResponse({ description: 'Employee not found' })
  getProfile(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<EmployeeProfileDto> {
    return this.employees.getProfile(user.id, id);
  }

  @Post()
  @ApiOperation({ summary: 'Create an employee on the caller’s team' })
  @ApiCreatedResponse({ type: EmployeeListItemDto })
  @ApiBadRequestResponse({ description: 'Validation failed' })
  @ApiNotFoundResponse({ description: 'Department not found' })
  @ApiConflictResponse({ description: 'Email already exists' })
  create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateEmployeeDto,
  ): Promise<EmployeeListItemDto> {
    return this.employees.create(user.id, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a team member’s name, email or department' })
  @ApiOkResponse({ type: EmployeeListItemDto })
  @ApiBadRequestResponse({ description: 'Validation failed' })
  @ApiNotFoundResponse({ description: 'Employee or department not found' })
  @ApiConflictResponse({ description: 'Email already exists' })
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateEmployeeDto,
  ): Promise<EmployeeListItemDto> {
    return this.employees.update(user.id, id, dto);
  }
}
