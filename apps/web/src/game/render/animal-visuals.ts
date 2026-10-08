import { MONSTER_SIZES } from './draw-helpers'

/** Drawn size in world pixels, shared by the canvas painter and the sprite layer. */
export function animalSize(kind: string): number {
  const small = kind === 'fish' || kind === 'bird' || kind === 'rabbit'
  return (
    MONSTER_SIZES[kind] ??
    (kind === 'fox'
      ? 16
      : kind === 'cat'
        ? 14
        : kind === 'chicken'
          ? 10
          : kind === 'bear' || kind === 'cow' || kind === 'horse'
            ? 22
            : small
              ? 14
              : kind === 'sheep'
                ? 18
                : 20)
  )
}

export function isFlyer(kind: string): boolean {
  return kind === 'dragon' || kind === 'ufo'
}

/** Fish and birds are always in motion; everyone else moves while they have just stepped. */
export function animalMoving(kind: string, t: number, movedAt: number): boolean {
  return kind === 'fish' || kind === 'bird' || t - movedAt < 320
}

const GRAZERS = ['deer', 'sheep', 'cow', 'horse', 'rabbit']

/** Vertical bob in world pixels: swimming, flapping, stepping, or a grazer's slow dip. */
export function animalBob(kind: string, id: number, moving: boolean, t: number): number {
  const speed =
    kind === 'fish' ? 0.0028 : kind === 'bird' ? 0.005 : kind === 'wolf' || kind === 'dog' ? 0.0042 : 0.0036
  const grazer = GRAZERS.includes(kind)
  const amp =
    kind === 'fish' ? 1.4 : kind === 'bird' || isFlyer(kind) ? 1.6 : moving ? 0.55 : grazer ? 0.45 : 0
  const phase = (moving || !grazer ? t * speed : t * 0.0012) + id * 0.7
  return Math.sin(phase) * amp
}

/** Walk-cycle frame, 0 or 1. */
export function animalStep(id: number, moving: boolean, t: number): number {
  return moving ? Math.floor(t / 200 + id) & 1 : 0
}
