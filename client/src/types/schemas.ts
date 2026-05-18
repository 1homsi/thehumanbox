import { z } from 'zod'

const TraitsSchema = z.object({
  curiosity:       z.number(),
  aggression:      z.number(),
  fear:            z.number(),
  memory_strength: z.number(),
  social_tendency: z.number(),
  resilience:      z.number(),
})

const MemoryCountSchema = z.object({
  food:   z.number(),
  water:  z.number(),
  danger: z.number(),
})

export const OrganismSchema = z.object({
  id:           z.string(),
  x:            z.number(),
  y:            z.number(),
  energy:       z.number(),
  hydration:    z.number(),
  health:       z.number(),
  age:          z.number(),
  alive:        z.boolean(),
  thought:      z.string(),
  infection:    z.number(),
  fear_level:   z.number(),
  carrying:     z.number(),
  carrying_type: z.number(),
  pregnant:     z.boolean(),
  partner_id:    z.string().nullable().optional(),
  attracted_to: z.string().nullable().optional(),

  memory_count:        MemoryCountSchema.optional(),
  attitudes:           z.record(z.string(), z.number()).optional(),
  org_trust:           z.record(z.string(), z.number()).optional(),
  has_reflected:       z.boolean().optional(),
  last_invention_tick: z.number().optional(),
  loneliness:          z.number().optional(),
  boredom:             z.number().optional(),
  comfort:             z.number().optional(),
  grief_ticks:         z.number().optional(),
  sleep_debt:          z.number().optional(),
  children_count:      z.number().optional(),
  conversation_count:  z.number().optional(),

  name:        z.string().optional(),
  generation:  z.number().optional(),
  parent_id:   z.string().optional(),
  father_id:   z.string().nullable().optional(),
  lineage_id:  z.string().optional(),
  max_age:     z.number().optional(),
  sex:         z.string().optional(),
  traits:      TraitsSchema.optional(),
  vocabulary:  z.record(z.string(), z.string()).optional(),
  discoveries: z.array(z.string()).optional(),
  home_x:      z.number().optional(),
  home_y:      z.number().optional(),
  is_elder:    z.boolean().optional(),
}).passthrough()

export type Organism = z.infer<typeof OrganismSchema>

export const AnimalSchema = z.object({
  id:   z.number(),
  x:    z.number(),
  y:    z.number(),
  kind: z.enum(['rabbit', 'deer', 'boar', 'bird', 'fish', 'wolf', 'dog']),
}).passthrough()

const OrgsHotSoaSchema = z.object({
  ids: z.array(z.string()),
}).passthrough()

export const WorldEnvelopeSchema = z.object({
  frame_id:           z.number(),
  server_sent_at_ms:  z.number(),
  frame_kind:         z.enum(['delta', 'full']),
  tick:               z.number(),
  organisms:          z.array(OrganismSchema).optional(),
  organisms_hot:      OrgsHotSoaSchema.optional(),
  organisms_complete: z.boolean(),
  animals:            z.array(AnimalSchema),
  animals_complete:   z.boolean(),
}).passthrough()
