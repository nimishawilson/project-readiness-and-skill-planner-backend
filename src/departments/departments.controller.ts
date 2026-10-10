import { Controller, Get } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { DepartmentsService } from './departments.service';
import { DepartmentDto } from './dto/department.dto';

@ApiTags('departments')
@ApiBearerAuth()
@Controller('departments')
export class DepartmentsController {
  constructor(private readonly departments: DepartmentsService) {}

  @Get()
  @ApiOperation({ summary: 'List departments' })
  @ApiOkResponse({ type: [DepartmentDto] })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid token' })
  findAll(): Promise<DepartmentDto[]> {
    return this.departments.findAll();
  }
}
