import { createFileRoute } from '@tanstack/react-router';
import { useSuspenseQuery, useQueryClient } from '@tanstack/react-query';
import { orpcUtils, orpcClient } from '@/rpc/react';

export const Route = createFileRoute('/_authenticated/app/board/$boardId')({
  loader: async ({ context, params }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(orpcUtils.board.listBoards.queryOptions({ input: {} })),
      context.queryClient.ensureQueryData(orpcUtils.board.getBoardData.queryOptions({ input: { boardId: params.boardId } })),
    ]);
  },
  component: BoardPage,
});

function BoardPage() {
  const { boardId } = Route.useParams();
  const { data } = useSuspenseQuery(orpcUtils.board.getBoardData.queryOptions({ input: { boardId } }));
  const { data: boards } = useSuspenseQuery(orpcUtils.board.listBoards.queryOptions({ input: {} }));
  const qc = useQueryClient();

  return (
    <div className="p-6">
      <h2 className="text-2xl font-bold text-white mb-1">{data.board.name}</h2>
      <p className="text-sm text-gray-500">
        {data.groups.length} group{data.groups.length !== 1 ? 's' : ''} · {data.tasks.length} task{data.tasks.length !== 1 ? 's' : ''}
      </p>
      <div className="mt-8 text-gray-400 text-sm">
        Board view coming soon — full React port of the existing UI is the next step.
      </div>
    </div>
  );
}
