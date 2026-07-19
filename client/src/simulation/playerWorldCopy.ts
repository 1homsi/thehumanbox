import type { PlayerWorldKind } from './worldSource'

export interface WelcomeStepCopy {
  title: string
  body: string
}

const SHARED_WELCOME_STEPS: readonly WelcomeStepCopy[] = [
  {
    title: 'Welcome to The Human Box',
    body:
      'A living planetary simulation. Tiny humans are born, learn, build, fight, pray, ' +
      'die, and pass their stories on. You are just watching.',
  },
  {
    title: 'A world that evolves',
    body:
      'Lineages climb through eras — stone, bronze, iron, classical, all the way up to ' +
      'the information age. They discover tools, found religions, write books, and ' +
      'build cities on real terrain.',
  },
  {
    title: 'Real, persistent organisms',
    body:
      'Every human has a name, family, traits, friends, beliefs, and memories. Tap one ' +
      'to read their life story, ancestry, and last thoughts.',
  },
  {
    title: 'Let it run',
    body:
      'The simulation runs continuously on the server. Come back anytime — civilisations ' +
      'will have risen, fallen, and rewritten history while you were gone.',
  },
]

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
      'This world runs and saves on this device. It does not connect to the Shared World server. ' +
      'You can choose Shared World later in Settings.',
  },
]

export function welcomeStepsFor(worldKind: PlayerWorldKind): readonly WelcomeStepCopy[] {
  return worldKind === 'local' ? LOCAL_WELCOME_STEPS : SHARED_WELCOME_STEPS
}

export function tourWorldCopy(worldKind: PlayerWorldKind): { opening: string; closing: string } {
  if (worldKind === 'local') {
    return {
      opening:
        'This is your private living world. Watch hundreds of tiny humans build a civilisation, or use the game controls to shape what happens.',
      closing:
        'Your world is saved on this device. Open Settings whenever you want to reset it or switch to the persistent Shared World.',
    }
  }
  return {
    opening:
      'This is the shared living simulation. Hundreds of tiny humans are born, learn, build, fight, pray, and die in real time.',
    closing:
      'The Shared World keeps running online when you close the app. Choose My World in Settings whenever you want a private game of your own.',
  }
}

export function worldsIntroCopy(worldKind: PlayerWorldKind, apiEnabled: boolean): string {
  if (worldKind === 'local') {
    return apiEnabled
      ? 'Your local world archives are saved on this computer. Open one to inspect its final state, or copy it into a new local fork.'
      : 'Your private world lives in this browser and does not connect to the Shared World server. Switch to Shared World in Settings to browse its archived civilizations.'
  }
  return 'The Shared World resets at the start of every month. Old worlds are frozen here forever — explore the end-state of each civilisation.'
}
