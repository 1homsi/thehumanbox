import type { PlayerWorldKind } from './worldSource'

export interface WelcomeStepCopy {
  title: string
  body: string
}

// One card: enough to know what this is, then the world itself. The tour is there for anyone who wants it.
const LOCAL_WELCOME_STEPS: readonly WelcomeStepCopy[] = [
  {
    title: 'You are their god',
    body:
      'Small tribes live, love, build and go to war on their own. When trouble comes they pray to you: ' +
      'click a prayer bubble and the power that helps is in your hand. It all runs and saves on this device.',
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
      'Your world saves on this device. Settings has photo mode, export, a fresh world, and this tour again.',
  }
}

export function worldsIntroCopy(worldKind: PlayerWorldKind, apiEnabled: boolean): string {
  void worldKind
  return apiEnabled
    ? 'Your world archives are saved on this computer.'
    : 'Your private world lives in this browser and never connects to a hosted simulation server.'
}
