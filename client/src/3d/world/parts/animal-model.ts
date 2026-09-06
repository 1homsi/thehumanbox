import {
  BoxGeometry,
  BufferGeometry,
  CapsuleGeometry,
  ConeGeometry,
  CylinderGeometry,
  SphereGeometry,
  Vector3,
  Quaternion,
} from 'three'
import type { AnimalState } from '../../../types'
const KIND_TINT: Record<string, string> = {
  rabbit: '#cccccc',
  deer: '#a8825a',
  boar: '#6a5240',
  bird: '#d4a040',
  fish: '#88aaff',
  wolf: '#555555',
  dog: '#b08850',
}

// A "part" is one InstancedMesh - geometry + material color + a local
// transform applied after the root translation/rotation/scale. We keep
// these declarative so a species is just an array of parts.
export interface PartDef {
  geom: () => BufferGeometry
  color: string
  offset: [number, number, number]
  rot: [number, number, number]
  // Most parts have unit scale baked into the geometry; if not, override.
  scale?: [number, number, number]
}

const TINT = (kind: string) => KIND_TINT[kind] ?? '#aa8855'

function makeSphere(r: number, w: number, h: number) {
  return new SphereGeometry(r, w, h)
}
function makeCapsule(r: number, l: number, cap: number, rad: number) {
  return new CapsuleGeometry(r, l, cap, rad)
}
function makeCylinder(rt: number, rb: number, h: number, seg: number) {
  return new CylinderGeometry(rt, rb, h, seg)
}
function makeBox(x: number, y: number, z: number) {
  return new BoxGeometry(x, y, z)
}
function makeCone(r: number, h: number, seg: number) {
  return new ConeGeometry(r, h, seg)
}

function baseParts(kind: AnimalState['kind']): PartDef[] {
  const tint = TINT(kind)
  switch (kind) {
    case 'rabbit':
      return [
        { geom: () => makeSphere(0.25, 6, 5), color: tint, offset: [0, 0.25, 0], rot: [0, 0, 0] },
        { geom: () => makeSphere(0.16, 5, 5), color: tint, offset: [0, 0.55, 0.05], rot: [0, 0, 0] },
        {
          geom: () => makeCylinder(0.025, 0.035, 0.28, 4),
          color: tint,
          offset: [-0.06, 0.78, 0.04],
          rot: [0.1, 0, -0.15],
        },
        {
          geom: () => makeCylinder(0.025, 0.035, 0.28, 4),
          color: tint,
          offset: [0.06, 0.78, 0.04],
          rot: [0.1, 0, 0.15],
        },
      ]
    case 'deer':
      return [
        // body
        {
          geom: () => makeCapsule(0.28, 0.6, 4, 6),
          color: tint,
          offset: [0, 0.8, 0],
          rot: [Math.PI / 2, 0, 0],
        },
        // legs (dark) - 4
        {
          geom: () => makeCylinder(0.06, 0.05, 0.8, 4),
          color: '#3a2a1a',
          offset: [-0.18, 0.4, 0.35],
          rot: [0, 0, 0],
        },
        {
          geom: () => makeCylinder(0.06, 0.05, 0.8, 4),
          color: '#3a2a1a',
          offset: [0.18, 0.4, 0.35],
          rot: [0, 0, 0],
        },
        {
          geom: () => makeCylinder(0.06, 0.05, 0.8, 4),
          color: '#3a2a1a',
          offset: [-0.18, 0.4, -0.35],
          rot: [0, 0, 0],
        },
        {
          geom: () => makeCylinder(0.06, 0.05, 0.8, 4),
          color: '#3a2a1a',
          offset: [0.18, 0.4, -0.35],
          rot: [0, 0, 0],
        },
        // head
        { geom: () => makeSphere(0.22, 6, 5), color: tint, offset: [0, 1.2, 0.4], rot: [0, 0, 0] },
        // antlers
        {
          geom: () => makeCylinder(0.02, 0.04, 0.35, 3),
          color: '#6b4a2a',
          offset: [-0.1, 1.5, 0.4],
          rot: [0.4, 0, 0.4],
        },
        {
          geom: () => makeCylinder(0.02, 0.04, 0.35, 3),
          color: '#6b4a2a',
          offset: [0.1, 1.5, 0.4],
          rot: [0.4, 0, -0.4],
        },
      ]
    case 'boar':
      return [
        {
          geom: () => makeCapsule(0.32, 0.55, 4, 6),
          color: tint,
          offset: [0, 0.45, 0],
          rot: [Math.PI / 2, 0, 0],
        },
        {
          geom: () => makeCylinder(0.06, 0.05, 0.35, 4),
          color: '#2a1a10',
          offset: [-0.16, 0.18, 0.28],
          rot: [0, 0, 0],
        },
        {
          geom: () => makeCylinder(0.06, 0.05, 0.35, 4),
          color: '#2a1a10',
          offset: [0.16, 0.18, 0.28],
          rot: [0, 0, 0],
        },
        {
          geom: () => makeCylinder(0.06, 0.05, 0.35, 4),
          color: '#2a1a10',
          offset: [-0.16, 0.18, -0.28],
          rot: [0, 0, 0],
        },
        {
          geom: () => makeCylinder(0.06, 0.05, 0.35, 4),
          color: '#2a1a10',
          offset: [0.16, 0.18, -0.28],
          rot: [0, 0, 0],
        },
        { geom: () => makeCone(0.18, 0.4, 5), color: tint, offset: [0, 0.55, 0.5], rot: [Math.PI / 2, 0, 0] },
      ]
    case 'bird':
      return [
        { geom: () => makeSphere(0.16, 6, 5), color: tint, offset: [0, 1.3, 0], rot: [0, 0, 0] },
        { geom: () => makeBox(0.3, 0.04, 0.18), color: tint, offset: [-0.18, 1.32, 0], rot: [0, 0, 0.3] },
        { geom: () => makeBox(0.3, 0.04, 0.18), color: tint, offset: [0.18, 1.32, 0], rot: [0, 0, -0.3] },
        {
          geom: () => makeCone(0.04, 0.1, 4),
          color: '#d8a040',
          offset: [0, 1.32, 0.16],
          rot: [Math.PI / 2, 0, 0],
        },
      ]
    case 'dog':
    case 'wolf':
      return [
        {
          geom: () => makeCapsule(0.22, 0.7, 4, 6),
          color: tint,
          offset: [0, 0.55, 0],
          rot: [Math.PI / 2, 0, 0],
        },
        {
          geom: () => makeCylinder(0.05, 0.04, 0.5, 4),
          color: tint,
          offset: [-0.14, 0.25, 0.32],
          rot: [0, 0, 0],
        },
        {
          geom: () => makeCylinder(0.05, 0.04, 0.5, 4),
          color: tint,
          offset: [0.14, 0.25, 0.32],
          rot: [0, 0, 0],
        },
        {
          geom: () => makeCylinder(0.05, 0.04, 0.5, 4),
          color: tint,
          offset: [-0.14, 0.25, -0.32],
          rot: [0, 0, 0],
        },
        {
          geom: () => makeCylinder(0.05, 0.04, 0.5, 4),
          color: tint,
          offset: [0.14, 0.25, -0.32],
          rot: [0, 0, 0],
        },
        { geom: () => makeSphere(0.17, 6, 5), color: tint, offset: [0, 0.75, 0.42], rot: [0, 0, 0] },
        { geom: () => makeCone(0.05, 0.12, 3), color: tint, offset: [-0.08, 0.92, 0.42], rot: [0, 0, -0.3] },
        { geom: () => makeCone(0.05, 0.12, 3), color: tint, offset: [0.08, 0.92, 0.42], rot: [0, 0, 0.3] },
      ]
    case 'fish':
      return [
        {
          geom: () => makeSphere(0.17, 8, 6),
          color: tint,
          offset: [0, 0, 0],
          rot: [0, 0, 0],
          scale: [0.65, 1, 1.8],
        },
        { geom: () => makeCone(0.12, 0.2, 4), color: tint, offset: [0, 0, -0.28], rot: [Math.PI / 2, 0, 0] },
      ]
    default:
      return baseParts('rabbit')
  }
}

// Small silhouette details remain instanced: draw calls depend on species,
// never on population. All species face local +Z.
export function buildPartsByKind(kind: AnimalState['kind']): PartDef[] {
  const parts = baseParts(kind)
  if (kind === 'deer') parts.splice(6, 2)
  const add = (
    geom: () => BufferGeometry,
    color: string,
    offset: [number, number, number],
    rot: [number, number, number] = [0, 0, 0],
  ) => parts.push({ geom, color, offset, rot })
  const head: Record<string, [number, number, number]> = {
    rabbit: [0.12, 0.6, 0.16],
    deer: [0.17, 1.25, 0.53],
    boar: [0.13, 0.59, 0.55],
    wolf: [0.13, 0.79, 0.52],
    dog: [0.13, 0.79, 0.52],
    bird: [0.1, 1.36, 0.11],
    fish: [0.1, 0.04, 0.15],
  }
  const [eyeX, eyeY, eyeZ] = head[kind] ?? head.rabbit
  for (const side of [-1, 1]) add(() => makeSphere(0.025, 5, 4), '#171b20', [side * eyeX, eyeY, eyeZ])
  if (kind === 'rabbit') {
    add(() => makeSphere(0.1, 6, 5), '#f4ede2', [0, 0.3, -0.23])
    add(() => makeSphere(0.035, 5, 4), '#c77f7c', [0, 0.54, 0.2])
    for (const side of [-1, 1]) {
      add(() => makeBox(0.025, 0.19, 0.018), '#dba4a1', [side * 0.075, 0.79, 0.073], [0.1, 0, side * 0.15])
      add(() => makeSphere(0.1, 6, 4), '#e4ddd2', [side * 0.16, 0.08, 0.12])
    }
  }
  if (kind === 'wolf' || kind === 'dog') {
    add(() => makeCapsule(0.09, 0.2, 3, 5), '#d9c9aa', [0, 0.7, 0.58], [Math.PI / 2, 0, 0])
    add(() => makeSphere(0.055, 5, 4), '#252429', [0, 0.7, 0.77])
    add(() => makeCone(0.11, 0.5, 5), TINT(kind), [0, 0.5, -0.65], [-1.1, 0, 0])
    if (kind === 'dog') add(() => makeCylinder(0.19, 0.19, 0.075, 8), '#b34f42', [0, 0.69, 0.37])
  }
  if (kind === 'deer') {
    add(() => makeCapsule(0.13, 0.32, 3, 6), '#c89f72', [0, 0.98, 0.35], [0.35, 0, 0])
    for (const side of [-1, 1]) {
      add(() => makeCone(0.09, 0.22, 4), '#b68e64', [side * 0.23, 1.34, 0.37], [0, 0, side * -0.8])
      const branch = (start: [number, number, number], end: [number, number, number]) => {
        const from = new Vector3(...start)
        const to = new Vector3(...end)
        const direction = to.clone().sub(from)
        const geometry = makeCylinder(0.015, 0.035, direction.length(), 4)
        geometry.applyQuaternion(
          new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), direction.normalize()),
        )
        const center = from.add(to).multiplyScalar(0.5)
        geometry.translate(center.x, center.y, center.z)
        return geometry
      }
      add(() => branch([side * 0.1, 1.33, 0.4], [side * 0.27, 1.75, 0.32]), '#6b4a2a', [0, 0, 0])
      add(() => branch([side * 0.19, 1.55, 0.36], [side * 0.34, 1.68, 0.5]), '#6b4a2a', [0, 0, 0])
    }
  }
  if (kind === 'boar') {
    add(() => makeBox(0.12, 0.14, 0.65), '#44372e', [0, 0.78, -0.05])
    for (const side of [-1, 1])
      add(() => makeCone(0.045, 0.19, 4), '#eadfc5', [side * 0.15, 0.48, 0.62], [0, 0, side * -0.3])
  }
  if (kind === 'fish') add(() => makeCone(0.1, 0.2, 3), '#416b9a', [0, 0.17, -0.03])
  return parts
}
