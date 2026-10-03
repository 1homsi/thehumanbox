import type { PlayerWorldKind } from './worldSource'

export interface WelcomeStepCopy {
  title: string
  body: string
}

const LOCAL_WELCOME_STEPS: readonly WelcomeStepCopy[] = [
  {
    title: 'You are their god',
    body:
      'A world of small tribes who cannot make it alone. They hunt, farm, build, fall in love and ' +
      'go to war, and when trouble comes they pray to you.',
  },
  {
    title: 'Answer their prayers',
    body:
      'A bubble over a tribe is a plea: hunger, thirst, sickness, fire, danger. Click it and the power ' +
      'that helps is in your hand. Answered prayers win their faith; ignored ones cost it.',
  },
  {
    title: 'Keep them alive',
    body:
      'A tribe on the brink turns red, with ⚠ in the header. Send newcomers, ward them from raids, ' +
      'make peace, cure them. A forgotten tribe dies out, and when the last one goes the world falls silent.',
  },
  {
    title: 'Lift them through the ages',
    body:
      'Each age remakes their world: huts become towns, tracks become roads, then come factories, ' +
      'railways and rockets. Inspire them to learn, plant forests around their mills, or bring the sky down.',
  },
  {
    title: 'Private and local by default',
    body:
      'This world runs and saves on this device. It never connects to a hosted simulation server. ' +
      'Export or reset it safely from Settings.',
  },
]

export function welcomeStepsFor(worldKind: PlayerWorldKind): readonly WelcomeStepCopy[] {
  void worldKind
  return LOCAL_WELCOME_STEPS
}

export function tourWorldCopy(worldKind: PlayerWorldKind): { opening: string; closing: string } {
  void worldKind
  return {
    opening:
      'These tribes need you. Answer their prayers, keep them alive and lift them through the ages, or see what becomes of them without you.',
    closing:
      'Your world is saved on this device. Open Settings whenever you want to export it or start a new world.',
  }
}

export function worldsIntroCopy(worldKind: PlayerWorldKind, apiEnabled: boolean): string {
  void worldKind
  return apiEnabled
    ? 'Your world archives are saved on this computer.'
    : 'Your private world lives in this browser and never connects to a hosted simulation server.'
}
