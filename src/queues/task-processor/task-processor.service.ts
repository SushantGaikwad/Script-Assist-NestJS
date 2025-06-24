import { Injectable, Logger } from '@nestjs/common';
import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { TasksService } from '../../modules/tasks/tasks.service';
import { TaskStatus } from '../../modules/tasks/enums/task-status.enum';
import { JobResult } from '../../common/enums/job-result.enum';

@Injectable()
@Processor('task-processing', {
  concurrency: 10, // Control concurrent job processing
})
export class TaskProcessorService extends WorkerHost {
  private readonly logger = new Logger(TaskProcessorService.name);
  private readonly MAX_RETRIES = 3; // Maximum retry attempts
  private readonly BATCH_SIZE = 50; // Batch size for overdue tasks processing

  constructor(private readonly tasksService: TasksService) {
    super();
  }

  @OnWorkerEvent('active')
  onActive(job: Job) {
    this.logger.debug(`Job ${job.id} of type ${job.name} started processing`);
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job) {
    this.logger.debug(`Job ${job.id} of type ${job.name} completed successfully`);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, error: Error) {
    this.logger.error(`Job ${job.id} of type ${job.name} failed: ${error.message}`, error.stack);
  }

  async process(job: Job): Promise<JobResult> {
    this.logger.debug(`Processing job ${job.id} of type ${job.name}`);

    if (job.attemptsMade >= this.MAX_RETRIES) {
      this.logger.error(`Job ${job.id} exceeded maximum retries (${this.MAX_RETRIES})`);
      return {
        success: false,
        error: `Max retries (${this.MAX_RETRIES}) exceeded`,
      };
    }

    try {
      switch (job.name) {
        case 'task-status-update':
          return await this.handleStatusUpdate(job);
        case 'process-overdue-task': // Updated to match OverdueTasksService job name
          return await this.handleOverdueTask(job);
        default:
          this.logger.warn(`Unknown job type: ${job.name}`);
          return {
            success: false,
            error: `Unknown job type: ${job.name}`,
          };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        `Error processing job ${job.id}: ${errorMessage}`,
        error instanceof Error ? error.stack : undefined,
      );

      // Allow BullMQ to handle retries based on job options
      throw new Error(errorMessage);
    }
  }

  private async handleStatusUpdate(job: Job): Promise<JobResult> {
    const { taskId, status } = job.data;

    // Validate input
    if (!taskId || !status) {
      return {
        success: false,
        error: 'Missing required data: taskId and status are required',
      };
    }

    // Validate status
    if (!Object.values(TaskStatus).includes(status)) {
      return {
        success: false,
        error: `Invalid status: ${status}`,
      };
    }

    try {
      // Update task status with transaction handling in TasksService
      const task = await this.tasksService.updateStatus(taskId, status);

      return {
        success: true,
        data: {
          taskId: task.id,
          newStatus: task.status,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to update task status';
      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  private async handleOverdueTask(job: Job): Promise<JobResult> {
    const { taskId, title, dueDate } = job.data;

    // Validate input
    if (!taskId) {
      return {
        success: false,
        error: 'Missing required data: taskId is required',
      };
    }

    try {
      // Example: Update task status to OVERDUE and log notification
      // In a real implementation, this might involve sending emails or notifications
      const task = await this.tasksService.updateStatus(taskId, TaskStatus.OVERDUE);

      this.logger.log(
        `Processed overdue task ${taskId}: Title="${title}", DueDate=${dueDate}, NewStatus=${task.status}`,
      );

      // Simulate notification (replace with actual notification logic)
      // e.g., await this.notificationService.sendOverdueNotification(task);

      return {
        success: true,
        data: {
          taskId: task.id,
          status: task.status,
          message: `Overdue task ${taskId} processed`,
        },
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to process overdue task';
      return {
        success: false,
        error: errorMessage,
      };
    }
  }
}
