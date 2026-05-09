import { z } from 'zod'

/**
 * Zod schemas for runtime validation of server-sent payloads.
 *
 * The Rust backend's serde structs are the source of truth for shape;
 * these mirror them so the frontend doesn't crash on a malformed message
 * (or silently keep using a stale type def after a server-side rename).
 *
 * For now we use lenient schemas (lots of .optional() and .passthrough())
 * because the wire format is fluid and we'd rather log the validation
 * error than reject a payload over a missing-but-harmless field. Tighten
 * over time as the protocol stabilises.
 */

// ── Primitives ────────────────────────────────────────────────────────────

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

// ── Organism ──────────────────────────────────────────────────────────────

export const OrganismSchema = z.object({
  // Hot fields (sent every tick)
  id:           z.string(),
  x:            z.number(),
  y:            z.number(),
  energy:       z.number(),
  hydration:    z.number(),
  health:       z.number(),
  age:          z.number(),
  alive:        z.boolean(),
  thought:      z.string(),
  memory_count: MemoryCountSchema,
  attitudes:    z.record(z.string(), z.number()),
  org_trust:    z.record(z.string(), z.number()),
  infection:    z.number(),
  carrying:     z.number(),
  carrying_type: z.number(),
  has_reflected: z.boolean(),
  last_invention_tick: z.number(),
  loneliness:   z.number(),
  boredom:      z.number(),
  fear_level:   z.number(),
  comfort:      z.number(),
  grief_ticks:  z.number(),
  sleep_debt:   z.number(),
  partner_id:    z.string().nullable().optional(),
  children_count: z.number(),
  pregnant:     z.boolean(),
  attracted_to: z.string().nullable().optional(),
  conversation_count: z.number(),

  // Cold fields (only sent on full snapshots - every 30+ ticks)
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
}).passthrough()  // accept future server-added fields without crashing

export type Organism = z.infer<typeof OrganismSchema>

// ── Animal ────────────────────────────────────────────────────────────────

export const AnimalSchema = z.object({
  id:   z.number(),
  x:    z.number(),
  y:    z.number(),
  kind: z.enum(['rabbit', 'deer']),
}).passthrough()

// ── World envelope ────────────────────────────────────────────────────────

// Lenient on purpose - only validate the shape we care to assert. The full
// payload includes many fields the existing TypeScript types already
// describe; we don't duplicate them all here. Use these schemas at the
// WS-parse boundary to catch corrupt messages (HTML error pages, partial
// frames, etc.) before they crash the renderer.

export const WorldEnvelopeSchema = z.object({
  tick:               z.number(),
  organisms:          z.array(OrganismSchema),
  organisms_complete: z.boolean(),
  animals:            z.array(AnimalSchema),
  animals_complete:   z.boolean(),
}).passthrough()
