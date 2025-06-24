import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { Task } from '../../modules/tasks/entities/task.entity';
import { TaskStatus } from '../../modules/tasks/enums/task-status.enum';

@Injectable()
export class OverdueTasksService {
  private readonly logger = new Logger(OverdueTasksService.name);
  private readonly BATCH_SIZE = 100; // Configurable batch size for queue operations

  constructor(
    @InjectQueue('task-processing')
    private taskQueue: Queue,
    @InjectRepository(Task)
    private tasksRepository: Repository<Task>,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async checkOverdueTasks() {
    this.logger.debug('Starting overdue tasks check...');

    try {
      const now = new Date();
      // Fetch overdue tasks in batches to optimize database performance
      let skip = 0;
      let hasMoreTasks = true;
      let totalOverdueTasks = 0;

      while (hasMoreTasks) {
        const overdueTasks = await this.tasksRepository.find({
          where: {
            dueDate: LessThan(now),
            status: TaskStatus.PENDING,
          },
          take: this.BATCH_SIZE,
          skip,
        });

        if (overdueTasks.length === 0) {
          hasMoreTasks = false;
          break;
        }

        // Prepare batch jobs for BullMQ
        const jobs = overdueTasks.map(task => ({
          name: 'process-overdue-task',
          data: {
            taskId: task.id,
            title: task.title,
            dueDate: task.dueDate,
          },
          opts: {
            attempts: 3, // Retry failed jobs up to 3 times
            backoff: {
              type: 'exponential',
              delay: 1000,
            },
          },
        }));

        // Add batch to queue
        try {
          await this.taskQueue.addBulk(jobs);
          totalOverdueTasks += overdueTasks.length;
          this.logger.log(`Enqueued ${overdueTasks.length} overdue tasks in batch (total: ${totalOverdueTasks})`);
        } catch (queueError) {
          this.logger.error(
            `Failed to enqueue ${overdueTasks.length} tasks: ${queueError instanceof Error ? queueError.message : 'Unknown error'}`,
            queueError instanceof Error ? queueError.stack : undefined,
          );
          // Continue processing next batch even if queueing fails for some tasks
        }

        skip += this.BATCH_SIZE;
      }

      if (totalOverdueTasks === 0) {
        this.logger.log('No overdue tasks found');
      } else {
        this.logger.log(`Completed overdue tasks check: ${totalOverdueTasks} tasks enqueued`);
      }
    } catch (error) {
      this.logger.error(
        `Overdue tasks check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw error; // Re-throw to allow monitoring tools to catch the error
    }

    this.logger.debug('Overdue tasks check completed');
  }
}