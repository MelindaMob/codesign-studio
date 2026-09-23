'use client'

import { useMemo } from 'react'
import { Background, Controls, MiniMap, ReactFlow, type Edge, type Node, type NodeProps } from 'reactflow'
import 'reactflow/dist/style.css'
import type { StudioElement } from '@/components/ElementCard'

type StepData = {
  stage: string
  action: string
  emotion: 'happy' | 'neutral' | 'frustrated'
  pain_point: string | null
  opportunity: string | null
}

const EMOTION: Record<StepData['emotion'], { label: string; emoji: string; className: string }> = {
  happy: { label: 'Satisfait', emoji: '🙂', className: 'bg-emerald-500' },
  neutral: { label: 'Neutre', emoji: '😐', className: 'bg-zinc-400' },
  frustrated: { label: 'Frustré', emoji: '😣', className: 'bg-red-500' },
}

function StepNode({ data }: NodeProps<StepData>) {
  const emotion = EMOTION[data.emotion] ?? EMOTION.neutral
  return (
    <div className="w-[220px] rounded-xl border border-zinc-200 bg-white p-3 shadow-sm">
      <div className="mb-1 flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-zinc-900">{data.stage || 'Étape'}</p>
        <span className="inline-flex items-center gap-1 text-xs text-zinc-500" title={emotion.label}>
          <span className={`h-2 w-2 rounded-full ${emotion.className}`} />
          {emotion.emoji}
        </span>
      </div>
      <p className="text-xs leading-5 text-zinc-600">{data.action}</p>
      {data.pain_point ? (
        <p className="mt-2 rounded-md bg-red-50 px-2 py-1 text-[11px] text-red-700">Douleur : {data.pain_point}</p>
      ) : null}
      {data.opportunity ? (
        <p className="mt-1 rounded-md bg-emerald-50 px-2 py-1 text-[11px] text-emerald-800">
          Opportunité : {data.opportunity}
        </p>
      ) : null}
    </div>
  )
}

const nodeTypes = { step: StepNode }

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

function parseSteps(content: Record<string, unknown> | null): StepData[] {
  const raw = Array.isArray(content?.steps) ? content.steps : []
  return raw.map((item) => {
    const row = asRecord(item)
    return {
      stage: typeof row.stage === 'string' ? row.stage : '',
      action: typeof row.action === 'string' ? row.action : '',
      emotion:
        row.emotion === 'happy' || row.emotion === 'frustrated' ? row.emotion : 'neutral',
      pain_point: typeof row.pain_point === 'string' && row.pain_point.trim() ? row.pain_point : null,
      opportunity: typeof row.opportunity === 'string' && row.opportunity.trim() ? row.opportunity : null,
    }
  })
}

export function JourneyCanvas({ journey, onClose }: { journey: StudioElement; onClose?: () => void }) {
  const content = asRecord(journey.content)
  const title = typeof content.title === 'string' && content.title.trim() ? content.title : 'Parcours'
  const personaName =
    typeof content.persona_name === 'string' && content.persona_name.trim() ? content.persona_name : 'Persona'
  const steps = useMemo(() => parseSteps(journey.content), [journey.content])

  const nodes: Node<StepData>[] = useMemo(
    () =>
      steps.map((step, index) => ({
        id: `step-${index}`,
        type: 'step',
        position: { x: index * 260, y: 0 },
        data: step,
      })),
    [steps]
  )

  const edges: Edge[] = useMemo(
    () =>
      steps.slice(0, -1).map((_, index) => ({
        id: `e-${index}`,
        source: `step-${index}`,
        target: `step-${index + 1}`,
      })),
    [steps]
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/40 px-4 py-8">
      <div className="flex w-full max-w-6xl flex-col rounded-2xl bg-white p-6 shadow-xl">
        <header className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-zinc-900">{title}</h2>
            <p className="mt-1 text-sm text-zinc-500">{personaName}</p>
          </div>
          {onClose ? (
            <button type="button" onClick={onClose} className="text-sm text-zinc-500 hover:text-zinc-900">
              Fermer
            </button>
          ) : null}
        </header>
        <div className="h-[420px] w-full overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-50">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            fitView
            nodesConnectable={false}
            proOptions={{ hideAttribution: true }}
          >
            <Background />
            <Controls />
            <MiniMap position="bottom-right" />
          </ReactFlow>
        </div>
      </div>
    </div>
  )
}
