export interface BulkOperationResult {
  taskId: string;
  success: boolean;
  data?: any;
  error?: string;
}
