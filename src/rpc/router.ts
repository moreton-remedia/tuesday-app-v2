import { pub } from '@/rpc/base';
import * as workspace from '@/domain/workspace/procedures';
import * as board from '@/domain/board/procedures';
import * as task from '@/domain/task/procedures';
import * as column from '@/domain/column/procedures';
import * as automation from '@/domain/automation/procedures';

export const health = pub.handler(() => ({ status: 'ok' as const }));

export const appRouter = {
  health,
  workspace,
  board,
  task,
  column,
  automation,
};

export type AppRouter = typeof appRouter;
