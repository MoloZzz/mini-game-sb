import { Button } from '@/components/Button';
import { Panel } from '@/components/ui/Panel';

interface ArchiveTaskPanelProps {
  onOpenArchive: () => void;
}

/** A voluntary task entry point. It does not show collection or achievement progress. */
export function ArchiveTaskPanel({ onOpenArchive }: ArchiveTaskPanelProps) {
  return (
    <Panel padding="lg" className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-4 border-sky-400/30 bg-sky-400/5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-300">Optional task</p>
        <h2 className="mt-1 text-xl font-bold text-neutral-100">Archive Notes</h2>
        <p className="mt-2 max-w-2xl text-sm text-neutral-400">Document three unique cards to earn an Archive Pass. Your cards stay in your collection.</p>
      </div>
      <Button variant="secondary" size="sm" onClick={onOpenArchive}>View notes</Button>
    </Panel>
  );
}
