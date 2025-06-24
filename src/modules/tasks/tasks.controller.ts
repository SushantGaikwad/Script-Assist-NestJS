import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Query,
  HttpException,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import { TasksService } from './tasks.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { TaskStatus } from './enums/task-status.enum';
import { RateLimitGuard } from '../../common/guards/rate-limit.guard';
import { RateLimit } from '../../common/decorators/rate-limit.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { BatchProcessDto, BatchResult } from './dto/batch-action.dto';
import { BatchAction } from '../../common/enums/batch-action.enum';

@ApiTags('tasks')
@Controller('tasks')
@UseGuards(JwtAuthGuard, RateLimitGuard)
@RateLimit({ limit: 100, windowMs: 60000 })
@ApiBearerAuth()
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new task' })
  create(@Body() createTaskDto: CreateTaskDto) {
    return this.tasksService.create(createTaskDto);
  }

  @Get()
  @ApiOperation({ summary: 'Find all tasks with optional filtering' })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'priority', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  async findAll(
    @Query('status') status?: string,
    @Query('priority') priority?: string,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
  ) {
    let { tasks, total, pages } = await this.tasksService.findAll(page, limit, status, priority);

    return {
      data: tasks,
      count: tasks.length,
      total_pages: pages,
      page: page,
    };
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get task statistics' })
  async getStats() {
    const statistics = await this.tasksService.getTaskStatisticsBuiltIn();
    return statistics;
  }

  @Get(':id')
  @ApiOperation({ summary: 'Find a task by ID' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    const task = await this.tasksService.findOne(id);
    return task;
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a task' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() updateTaskDto: UpdateTaskDto) {
    return this.tasksService.update(id, updateTaskDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a task' })
  remove(@Param('id') id: string) {
    return this.tasksService.remove(id);
  }

  @Post('batch')
  @ApiOperation({ summary: 'Batch process multiple tasks' })
  async batchProcess(@Body() operations: BatchProcessDto): Promise<BatchResult[]> {
    const { tasks: taskIds, action } = operations;

    // Validate input
    if (!taskIds?.length || !Object.values(BatchAction).includes(action)) {
      throw new HttpException(
        'Invalid input: tasks array must not be empty and action must be valid',
        HttpStatus.BAD_REQUEST,
      );
    }

    try {
      // Single service call for all batch processing
      return await this.tasksService.processBatch(taskIds, action);
    } catch (error) {
      throw new HttpException(
        error instanceof Error ? error.message : 'Batch processing failed',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
