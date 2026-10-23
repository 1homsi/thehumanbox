import { t } from '../../../i18n'

export const DAY_LENGTH = 600

export function fmt(ticks: number) {
  const days = Math.floor(ticks / DAY_LENGTH)
  return t('person.format.days', { count: days })
}
