import { Link } from 'react-router-dom';
import type { CollectionGoalDto } from '@card-game/shared-types';

export function CollectionGoal({ goal }: { goal: CollectionGoalDto }) {
  const percent = goal.progress.target > 0 ? (goal.progress.current / goal.progress.target) * 100 : 0;
  const reward = goal.reward
    ? [goal.reward.coins > 0 ? `${goal.reward.coins} coins` : null, goal.reward.keys > 0 ? `${goal.reward.keys} keys` : null]
        .filter(Boolean)
        .join(' + ')
    : null;

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-amber-400/30 bg-amber-400/5 p-4" aria-label="Next collection goal">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-300">Next goal</p>
          <h2 className="mt-1 text-lg font-bold text-neutral-100">{goal.title}</h2>
          <p className="mt-1 text-sm text-neutral-300">{goal.description}</p>
        </div>
        {goal.kind === 'milestone' && <span className="rounded-full bg-neutral-950 px-2 py-1 text-xs text-neutral-400">Milestone</span>}
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-neutral-800">
        <div className="h-full rounded-full bg-amber-400 transition-[width]" style={{ width: `${Math.min(100, percent)}%` }} />
      </div>
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="text-neutral-300">{goal.progress.current} / {goal.progress.target}</span>
        {reward && <span className="text-amber-200">Reward: {reward}</span>}
      </div>
      <Link to={goal.action.href} className="w-fit rounded-md bg-amber-400 px-3 py-2 text-sm font-semibold text-neutral-950 transition-colors hover:bg-amber-300">
        {goal.action.label}
      </Link>
    </section>
  );
}
