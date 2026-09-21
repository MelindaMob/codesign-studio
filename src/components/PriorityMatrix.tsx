'use client'

import { DndContext, useDraggable, useDroppable, type DragEndEvent } from '@dnd-kit/core'
import type { ReactNode } from 'react'
import { setPriority, type ActionCtx } from '@/lib/elementActions'
import type { StudioElement } from '@/components/ElementCard'

const QUADRANTS = [
  { id: 'quick', label: 'Quick wins', impact: 4, effort: 2 },
  { id: 'ambitious', label: 'Paris ambitieux', impact: 4, effort: 4 },
  { id: 'small', label: 'Petits plus', impact: 2, effort: 2 },
  { id: 'reconsider', label: 'À reconsidérer', impact: 2, effort: 4 },
] as const

type QuadrantId = (typeof QUADRANTS)[number]['id'] | 'unprioritized'

function quadrantOf(element: StudioElement): QuadrantId {
  if (element.priority_impact == null || element.priority_effort == null) return 'unprioritized'
  const highImpact = element.priority_impact >= 3
  const highEffort = element.priority_effort >= 3
  if (highImpact && !highEffort) return 'quick'
  if (highImpact && highEffort) return 'ambitious'
  if (!highImpact && !highEffort) return 'small'
  return 'reconsider'
}

function titleOf(element: StudioElement) {
  const content = element.content
  if (content && typeof content === 'object' && 'title' in content && typeof content.title === 'string') {
    return content.title
  }
  return 'Fonctionnalité'
}

function Chip({ element }: { element: StudioElement }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: element.id,
  })
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined

  return (
    <button
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={`max-w-full truncate rounded-full border border-zinc-200 bg-white px-3 py-1 text-left text-xs font-medium text-zinc-800 shadow-sm ${
        isDragging ? 'z-10 opacity-80' : ''
      }`}
    >
      {titleOf(element)}
    </button>
  )
}

function DropZone({
  id,
  label,
  hint,
  children,
}: {
  id: string
  label: string
  hint?: string
  children: ReactNode
}) {
  const { setNodeRef, isOver } = useDroppable({ id })
  return (
    <div
      ref={setNodeRef}
      className={`min-h-28 rounded-xl border p-3 ${
        isOver ? 'border-indigo-400 bg-indigo-50' : 'border-zinc-200 bg-zinc-50'
      }`}
    >
      <p className="text-xs font-semibold text-zinc-800">{label}</p>
      {hint ? <p className="mb-2 text-[11px] text-zinc-400">{hint}</p> : <div className="mb-2" />}
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  )
}

type PriorityMatrixProps = {
  ctx: ActionCtx
  features: StudioElement[]
  onUpdated: (row: Record<string, unknown>) => void
  onToast: (message: string, kind: 'ok' | 'err') => void
}

export function PriorityMatrix({ ctx, features, onUpdated, onToast }: PriorityMatrixProps) {
  const visible = features.filter((el) => el.status !== 'rejected')

  async function onDragEnd(event: DragEndEvent) {
    const overId = event.over?.id
    const activeId = String(event.active.id)
    if (!overId) return
    const quadrant = QUADRANTS.find((item) => item.id === overId)
    if (!quadrant) return
    const element = visible.find((item) => item.id === activeId)
    if (!element) return
    try {
      const row = await setPriority(ctx, element, quadrant.impact, quadrant.effort)
      onUpdated(row as Record<string, unknown>)
      onToast('Priorité mise à jour.', 'ok')
    } catch (e) {
      onToast(e instanceof Error ? e.message : 'Priorisation impossible', 'err')
    }
  }

  return (
    <DndContext onDragEnd={(event) => void onDragEnd(event)}>
      <div className="mb-2 flex items-center justify-between text-[11px] tracking-wide text-zinc-400 uppercase">
        <span>Impact ↑</span>
        <span>Effort →</span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {QUADRANTS.map((quadrant) => (
          <DropZone
            key={quadrant.id}
            id={quadrant.id}
            label={quadrant.label}
            hint={`Impact ${quadrant.impact} · Effort ${quadrant.effort}`}
          >
            {visible
              .filter((el) => quadrantOf(el) === quadrant.id)
              .map((el) => (
                <Chip key={el.id} element={el} />
              ))}
          </DropZone>
        ))}
      </div>
      <div className="mt-3">
        <DropZone id="unprioritized" label="Non priorisées">
          {visible
            .filter((el) => quadrantOf(el) === 'unprioritized')
            .map((el) => (
              <Chip key={el.id} element={el} />
            ))}
        </DropZone>
      </div>
    </DndContext>
  )
}
