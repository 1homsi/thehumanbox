import type { PlayerWorldKind } from './worldSource'

export interface WelcomeStepCopy {
  title: string
  body: string
}

const LOCAL_WELCOME_STEPS: readonly WelcomeStepCopy[] = [
  {
    title: 'This is your Human Box',
    body:
      'A private living world running on your device. Tiny humans are born, learn, build, ' +
      'fight, pray, die, and pass their stories on.',
  },
  {
    title: 'Watch it evolve — or shape it',
    body:
      'Follow any human, explore their family and memories, or use the game controls to change ' +
      'time, place buildings, and create disasters.',
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
      'This is your private living world. Watch hundreds of tiny humans build a civilisation, or use the game controls to shape what happens.',
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
