import { useEffect, useState } from 'react';
import { ARCHETYPES, ARCHETYPE_RARITIES, ELEMENTS, type Archetype, type CreateGenerationOrderRequest, type Element, type GenerationOrderDto, type Rarity } from '@card-game/shared-types';
import { Button } from '@/components/Button';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { Panel } from '@/components/ui/Panel';
import { createGenerationOrder, getGenerationOrders, queueGenerationOrder, retryGenerationOrder } from '@/lib/api';
import { ApiClientError } from '@/lib/apiError';

const NONE = '__none__';
const initial: CreateGenerationOrderRequest = { title: '', brief: '', archetype: 'beast', element: null, suggestedRarity: 'common', candidateCount: 4, setId: null };

function messageFor(error: unknown, fallback: string): string {
  return error instanceof ApiClientError ? error.message : fallback;
}

/** Small operator-facing work queue; the local Forge worker processes ready orders. */
export function GenerationOrders() {
  const [form, setForm] = useState<CreateGenerationOrderRequest>(initial);
  const [orders, setOrders] = useState<GenerationOrderDto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const load = async () => { try { setOrders(await getGenerationOrders()); } catch { setError('Could not load generation orders.'); } };
  useEffect(() => {
    void load();
    const refreshId = window.setInterval(() => { void load(); }, 5_000);
    return () => window.clearInterval(refreshId);
  }, []);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setSaving(true); setError(null);
    try { await createGenerationOrder(form); setForm(initial); await load(); } catch (error) { setError(messageFor(error, 'Could not create the generation order.')); } finally { setSaving(false); }
  };
  const queue = async (id: string) => { try { await queueGenerationOrder(id); await load(); } catch (error) { setError(messageFor(error, 'Could not queue the generation order.')); } };
  const retry = async (id: string) => { try { await retryGenerationOrder(id); await load(); } catch (error) { setError(messageFor(error, 'Could not retry the generation order.')); } };
  const changeArchetype = (archetype: Archetype) => {
    const allowedRarities = ARCHETYPE_RARITIES[archetype];
    setForm((current) => ({
      ...current,
      archetype,
      suggestedRarity: allowedRarities.includes(current.suggestedRarity) ? current.suggestedRarity : allowedRarities[0]!,
    }));
  };
  return <main className="mx-auto max-w-5xl p-6"><h1 className="text-2xl font-bold">Generation orders</h1><p className="mt-1 text-sm text-neutral-400">Creates offline Forge work. The local worker processes queued orders; Stable Diffusion never runs in the game server.</p>
    {error && <ErrorBanner className="mt-4">{error}</ErrorBanner>}
    <Panel className="mt-6"><form className="grid gap-4 md:grid-cols-2" onSubmit={submit}>
      <label className="text-sm">Title<input required maxLength={80} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="mt-1 w-full rounded border border-neutral-700 bg-neutral-950 p-2" /></label>
      <label className="text-sm">Candidates<select value={form.candidateCount ?? 4} onChange={(e) => setForm({ ...form, candidateCount: Number(e.target.value) })} className="mt-1 w-full rounded border border-neutral-700 bg-neutral-950 p-2">{[2,3,4,5,6].map((n) => <option key={n}>{n}</option>)}</select></label>
      <label className="text-sm md:col-span-2">Visual brief<textarea required minLength={10} maxLength={360} value={form.brief} onChange={(e) => setForm({ ...form, brief: e.target.value })} rows={3} className="mt-1 w-full rounded border border-neutral-700 bg-neutral-950 p-2" /></label>
      <label className="text-sm">Archetype<select value={form.archetype} onChange={(e) => changeArchetype(e.target.value as Archetype)} className="mt-1 w-full rounded border border-neutral-700 bg-neutral-950 p-2">{ARCHETYPES.map((value) => <option key={value}>{value}</option>)}</select></label>
      <label className="text-sm">Element<select value={form.element ?? NONE} onChange={(e) => setForm({ ...form, element: e.target.value === NONE ? null : e.target.value as Element })} className="mt-1 w-full rounded border border-neutral-700 bg-neutral-950 p-2"><option value={NONE}>none</option>{ELEMENTS.map((value) => <option key={value}>{value}</option>)}</select></label>
      <label className="text-sm">Suggested rarity<select value={form.suggestedRarity} onChange={(e) => setForm({ ...form, suggestedRarity: e.target.value as Rarity })} className="mt-1 w-full rounded border border-neutral-700 bg-neutral-950 p-2">{ARCHETYPE_RARITIES[form.archetype].map((value) => <option key={value}>{value}</option>)}</select></label>
      <div className="flex items-end"><Button disabled={saving} type="submit">Create draft order</Button></div>
    </form></Panel>
    <section className="mt-6 w-full"><h2 className="text-lg font-semibold">Queue</h2><div className="mt-3 grid gap-3">{orders.map((order) => <Panel key={order.id} className="flex w-full flex-wrap items-start gap-4 overflow-hidden p-4"><div className="min-w-0 flex-1"><p className="break-words font-medium">{order.title}</p><p className="break-words text-sm text-neutral-400">{order.brief}</p><p className="mt-1 break-words text-xs text-neutral-500">{order.status} · {order.candidateCount} candidates · {order.suggestedRarity} {order.archetype}</p></div>{order.status === 'draft' && <Button size="sm" onClick={() => void queue(order.id)}>Queue for Forge</Button>}{order.status === 'failed' && <Button size="sm" onClick={() => void retry(order.id)}>Retry with Forge</Button>}{order.status === 'ready' && <span className="text-sm text-amber-300">Waiting for local Forge worker</span>}{order.status === 'generating' && <span className="text-sm text-sky-300">Generating candidates…</span>}{order.status === 'review' && <span className="text-sm text-emerald-300">Review candidates in Review</span>}</Panel>)}</div></section>
  </main>;
}
