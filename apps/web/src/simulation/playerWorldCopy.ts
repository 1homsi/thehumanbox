import { t } from '../i18n'
import type { PlayerWorldKind } from './worldSource'

export interface WelcomeStepCopy {
  title: string
  body: string
}

// One card: enough to know what this is, then the world itself. The tour is there for anyone who wants it.
const localWelcomeSteps = (): readonly WelcomeStepCopy[] => [
  { title: t('welcome.title'), body: t('welcome.body') },
]

export function welcomeStepsFor(worldKind: PlayerWorldKind): readonly WelcomeStepCopy[] {
  void worldKind
  return localWelcomeSteps()
}

export function tourWorldCopy(worldKind: PlayerWorldKind): { opening: string; closing: string } {
  void worldKind
  return { opening: t('tour.opening'), closing: t('tour.closing') }
}

export function worldsIntroCopy(worldKind: PlayerWorldKind, apiEnabled: boolean): string {
  void worldKind
  return apiEnabled ? t('worlds.introDesktop') : t('worlds.introBrowser')
}
