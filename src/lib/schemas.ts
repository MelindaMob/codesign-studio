import { z } from 'zod'

// Champs communs : stockés dans les colonnes `confidence` et `reasoning` de `elements`
// `source_ids` (ex: ["S1","S3"]) sert à remplir la table `element_sources` (citations)
const meta = {
  source_ids: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(1),
  reasoning: z.string().min(10),
}

export const PersonaSchema = z.object({
  name: z.string().min(1),
  age: z.number().int().min(15).max(95),
  role: z.string().min(1),
  context: z.string().min(1),
  goals: z.array(z.string().min(1)).min(2).max(4),
  frustrations: z.array(z.string().min(1)).min(2).max(4),
  quote: z.string().min(1),
  ai_trust_level: z.number().int().min(1).max(5),
  preferred_autonomy: z.enum(['suggest', 'draft', 'act']),
  ...meta,
})

export const JourneySchema = z.object({
  title: z.string().min(1),
  persona_name: z.string().min(1),
  steps: z
    .array(
      z.object({
        stage: z.string().min(1),
        action: z.string().min(1),
        emotion: z.enum(['happy', 'neutral', 'frustrated']),
        pain_point: z.string().nullable(),
        opportunity: z.string().nullable(),
      })
    )
    .min(4)
    .max(8),
  ...meta,
})

export const FeatureSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  user_value: z.string().min(1),
  // stockés dans priority_impact / priority_effort
  impact: z.number().int().min(1).max(5),
  effort: z.number().int().min(1).max(5),
  ...meta,
})

export const schemas = {
  persona: PersonaSchema,
  journey: JourneySchema,
  feature: FeatureSchema,
} as const

export type ElementKind = keyof typeof schemas
export type Persona = z.infer<typeof PersonaSchema>
export type Journey = z.infer<typeof JourneySchema>
export type Feature = z.infer<typeof FeatureSchema>
