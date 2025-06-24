import { BatchAction } from '../../../common/enums/batch-action.enum';

export class BatchProcessDto {
  tasks: string[];
  action: BatchAction;
}

export interface BatchResult {
  taskId: string;
  success: boolean;
  result?: any;
  error?: string;
}
