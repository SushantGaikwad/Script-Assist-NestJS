import { HttpException, HttpStatus, Injectable, InternalServerErrorException, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { Task } from './entities/task.entity';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { TaskStatus } from './enums/task-status.enum';
import { TaskPriority } from './enums/task-priority.enum';
import { BulkOperationResult } from '../../common/interfaces/bulk.operations.interface';
import { BatchAction } from '../../common/enums/batch-action.enum';

@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);

  constructor(
    @InjectRepository(Task)
    private tasksRepository: Repository<Task>,
    @InjectQueue('task-processing')
    private taskQueue: Queue,
    private dataSource: DataSource,
  ) {}

  async create(createTaskDto: CreateTaskDto): Promise<Task> {
    // Inefficient implementation: creates the task but doesn't use a single transaction
    // for creating and adding to queue, potential for inconsistent state
    const task = this.tasksRepository.create(createTaskDto);
    const savedTask = await this.tasksRepository.save(task);

    // Add to queue without waiting for confirmation or handling errors
    this.taskQueue.add('task-status-update', {
      taskId: savedTask.id,
      status: savedTask.status,
    });

    return savedTask;
  }

  async findAll(
    page: number = 1,
    limit: number = 10,
    status?: string,
    priority?: string,
  ): Promise<{ tasks: Task[]; total: number; pages: number }> {
    const queryBuilder = this.tasksRepository
      .createQueryBuilder('task')
      .leftJoinAndSelect('task.user', 'user')
      .take(limit)
      .skip((page - 1) * limit);

    if (status) {
      queryBuilder.where('task.status = :status', { status });
    }

    if (priority) {
      queryBuilder.andWhere('task.priority = :priority', { priority });
    }

    const [tasks, total] = await queryBuilder.getManyAndCount();
    return { tasks, total, pages: Math.ceil(total / limit) };
  }

  async findOne(id: string): Promise<Task> {
    const task = await this.tasksRepository.findOne({
      where: { id },
    });

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    return task;
  }

  async update(id: string, updateTaskDto: UpdateTaskDto): Promise<Task | null> {
    return this.dataSource
      .transaction(async manager => {
        try {
          // Step 1: Get current task to check status change and validate existence
          const currentTask = await manager.findOne(Task, {
            where: { id },
            select: ['id', 'status'], // Only select what we need
          });

          if (!currentTask) {
            throw new NotFoundException('Task not found');
          }

          const originalStatus = currentTask.status;

          // Step 2: Build update object with only defined fields
          const updateFields = this.buildUpdateFields(updateTaskDto);

          if (Object.keys(updateFields).length === 0) {
            // No fields to update, return current task with relations
            return await manager.findOne(Task, {
              where: { id },
              relations: ['user'],
            });
          }

          // Step 3: Perform atomic update
          const updateResult = await manager.update(Task, { id }, updateFields);

          if (updateResult.affected === 0) {
            throw new NotFoundException('Task not found');
          }

          // Step 4: Get updated task with relations
          const updatedTask = await manager.findOne(Task, {
            where: { id },
            relations: ['user'],
          });

          return updatedTask!;
        } catch (error) {
          this.logger.error(`Error updating task ${id}:`, error);

          if (error instanceof NotFoundException) {
            throw error;
          }

          throw new InternalServerErrorException('Failed to update task');
        }
      })
      .then(async updatedTask => {
        // Step 6: Queue operations after successful transaction (fire and forget)
        if (updateTaskDto.status && updatedTask?.status !== updatedTask?.status) {
          this.queueStatusUpdate(updatedTask).catch(error =>
            this.logger.error('Failed to queue status update:', error),
          );
        }

        return updatedTask;
      });
  }

   // Helper method to build update fields
  private buildUpdateFields(updateTaskDto: UpdateTaskDto): Partial<Task> {
    const updateFields: Partial<Task> = {};

    // Only include fields that are actually provided and not undefined/null
    if (updateTaskDto.title !== undefined) {
      updateFields.title = updateTaskDto.title;
    }
    if (updateTaskDto.description !== undefined) {
      updateFields.description = updateTaskDto.description;
    }
    if (updateTaskDto.status !== undefined) {
      updateFields.status = updateTaskDto.status;
    }
    if (updateTaskDto.priority !== undefined) {
      updateFields.priority = updateTaskDto.priority;
    }
    if (updateTaskDto.dueDate !== undefined) {
      updateFields.dueDate = updateTaskDto.dueDate;
    }

    // Always update the timestamp
    if (Object.keys(updateFields).length > 0) {
      updateFields.updatedAt = new Date();
    }

    return updateFields;
  }

  // Queue status update with proper error handling
  private async queueStatusUpdate(task: Task | null): Promise<void> {
    try {
      await this.taskQueue.add(
        'task-status-update',
        {
          taskId: task?.id,
          status: task?.status,
          userId: task?.userId,
          timestamp: new Date().toISOString(),
        },
        {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000,
          },
          removeOnComplete: 100,
          removeOnFail: 50,
        }
      );
    } catch (error) {
      // Log but don't fail the main operation
      this.logger.error(`Failed to queue status update for task ${task?.id}:`, error);
    }
  }

async remove(id: string): Promise<{ message: string; deletedId: string }> {
    try {
      // Single atomic delete operation
      const deleteResult = await this.tasksRepository.delete({ id });

      if (deleteResult.affected === 0) {
        throw new NotFoundException('Task not found');
      }

      this.logger.log(`Task ${id} deleted successfully`);
      
      return {
        message: 'Task deleted successfully',
        deletedId: id
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      
      this.logger.error(`Error deleting task ${id}:`, error);
      throw new InternalServerErrorException('Failed to delete task');
    }
  }

  async findByStatus(status: TaskStatus): Promise<Task[]> {
    // Inefficient implementation: doesn't use proper repository patterns
    const query = 'SELECT * FROM tasks WHERE status = $1';
    return this.tasksRepository.query(query, [status]);
  }

  async updateStatus(id: string, status: string): Promise<Task> {
    // This method will be called by the task processor
    const task = await this.findOne(id);
    task.status = status as any;
    return this.tasksRepository.save(task);
  }

  async getTaskStatisticsBuiltIn() {
    const [total, completed, inProgress, pending, highPriority] = await Promise.all([
      this.tasksRepository.count(),
      this.tasksRepository.count({ where: { status: TaskStatus.COMPLETED } }),
      this.tasksRepository.count({ where: { status: TaskStatus.IN_PROGRESS } }),
      this.tasksRepository.count({ where: { status: TaskStatus.PENDING } }),
      this.tasksRepository.count({ where: { priority: TaskPriority.HIGH } }),
    ]);

    return {
      total,
      completed,
      inProgress,
      pending,
      highPriority,
    };
  }


  async bulkUpdate(taskIds: string[], updateData: Partial<Task>): Promise<BulkOperationResult[]> {
    const results: BulkOperationResult[] = [];

    try {
      // Validate task existence
      const tasks = await this.tasksRepository.find({
        where: { id: In(taskIds) },
      });

      // Map existing task IDs for quick lookup
      const existingTaskIds = new Set(tasks.map(task => task.id));
      const missingTaskIds = taskIds.filter(id => !existingTaskIds.has(id));

      // Handle missing tasks
      missingTaskIds.forEach(taskId => {
        results.push({
          taskId,
          success: false,
          error: `Task with ID ${taskId} not found`,
        });
      });

      // Perform bulk update for existing tasks
      if (existingTaskIds.size > 0) {

        // Add successful updates to results
        tasks.forEach(task => {
          results.push({
            taskId: task.id,
            success: true,
            data: { ...task, ...updateData },
          });
        });
      }

      // Sort results to match input order
      return taskIds.map(id => results.find(result => result.taskId === id)!);
    } catch (error) {
      // Handle unexpected errors
      return taskIds.map(taskId => ({
        taskId,
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update tasks',
      }));
    }
  }

  async bulkRemove(taskIds: string[]): Promise<BulkOperationResult[]> {
    const results: BulkOperationResult[] = [];

    try {
      // Validate task existence
      const tasks = await this.tasksRepository.find({
        where: { id: In(taskIds) },
      });

      // Map existing task IDs for quick lookup
      const existingTaskIds = new Set(tasks.map(task => task.id));
      const missingTaskIds = taskIds.filter(id => !existingTaskIds.has(id));

      // Handle missing tasks
      missingTaskIds.forEach(taskId => {
        results.push({
          taskId,
          success: false,
          error: `Task with ID ${taskId} not found`,
        });
      });

      // Perform bulk delete for existing tasks
      if (existingTaskIds.size > 0) {
        await this.tasksRepository.delete({
          id: In(Array.from(existingTaskIds)),
        });

        // Add successful deletions to results
        tasks.forEach(task => {
          results.push({
            taskId: task.id,
            success: true,
            data: { message: `Task ${task.id} deleted successfully` },
          });
        });
      }

      // Sort results to match input order
      return taskIds.map(id => results.find(result => result.taskId === id)!);
    } catch (error) {
      // Handle unexpected errors
      return taskIds.map(taskId => ({
        taskId,
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete tasks',
      }));
    }
  }

    async processBatch(taskIds: string[], action: BatchAction): Promise<BulkOperationResult[]> {
    try {
      let results: BulkOperationResult[];

      switch (action) {
        case BatchAction.COMPLETE:
          results = await this.processCompleteAction(taskIds);
          break;
        case BatchAction.DELETE:
          results = await this.processDeleteAction(taskIds);
          break;
        default:
          throw new HttpException(`Unsupported action: ${action}`, HttpStatus.BAD_REQUEST);
      }

      return results;
    } catch (error) {
      // Handle unexpected errors
      return taskIds.map(taskId => ({
        taskId,
        success: false,
        error: error instanceof Error ? error.message : 'Batch processing failed',
      }));
    }
  }

  private async processCompleteAction(taskIds: string[]): Promise<BulkOperationResult[]> {
    try {
      // Bulk update instead of individual updates
      const updateResults = await this.bulkUpdate(taskIds, {
        status: TaskStatus.COMPLETED,
      });

      return taskIds.map((taskId, index) => ({
        taskId,
        success: true,
        data: updateResults[index].data,
      }));
    } catch (error) {
      return taskIds.map(taskId => ({
        taskId,
        success: false,
        error: error instanceof Error ? error.message : 'Failed to complete task',
      }));
    }
  }

  private async processDeleteAction(taskIds: string[]): Promise<BulkOperationResult[]> {
    try {
      // Bulk delete instead of individual deletes
      const deleteResults = await this.bulkRemove(taskIds);

      return taskIds.map((taskId, index) => ({
        taskId,
        success: true,
        data: deleteResults[index].data,
      }));
    } catch (error) {
      return taskIds.map(taskId => ({
        taskId,
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete task',
      }));
    }
  }
}
