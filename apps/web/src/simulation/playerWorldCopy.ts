import type { PlayerWorldKind } from './worldSource'
import { t } from '../i18n'

export interface WelcomeStepCopy {
  title: string
  body: string
}

// One card: enough to know what this is, then the world itself. The tour is there for anyone who wants it.
export function welcomeStepsFor(worldKind: PlayerWorldKind): readonly WelcomeStepCopy[] {
  void worldKind
  return [
    {
      title: t('dialogs.welcome.localTitle'),
      body: t('dialogs.welcome.localBody'),
    },
  ]
}

export function tourWorldCopy(worldKind: PlayerWorldKind): { opening: string; closing: string } {
  void worldKind
  return {
    opening: t('tour.worldCopy.opening'),
    closing: t('tour.worldCopy.closing'),
  }
}

export function worldsIntroCopy(worldKind: PlayerWorldKind, apiEnabled: boolean): string {
  void worldKind
  return apiEnabled ? t('dialogs.worlds.introArchives') : t('dialogs.worlds.introPrivate')
}
