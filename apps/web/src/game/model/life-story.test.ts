import { describe, expect, it } from 'vitest'
import { lifeStory, type StoryPerson } from './life-story'

const base: StoryPerson = {
  id: 'me',
  name: 'Ada',
  alive: true,
  age: 600 * 30,
  generation: 2,
}

describe('lifeStory', () => {
  it('tells parents, trade, partner and children in order, then how life stands', () => {
    const mum: StoryPerson = { ...base, id: 'mum', name: 'Mira' }
    const dad: StoryPerson = { ...base, id: 'dad', name: 'Tomas', custom_name: 'Tom' }
    const partner: StoryPerson = { ...base, id: 'pal', name: 'Bo' }
    const me: StoryPerson = {
      ...base,
      parent_id: 'mum',
      father_id: 'dad',
      specialty: 'healer',
      partner_id: 'pal',
      children_count: 2,
    }
    expect(lifeStory(me, [mum, dad, partner])).toEqual([
      'Child of Mira and Tom.',
      'Took up the trade of healer.',
      'Partnered with Bo.',
      'Parent of 2 children.',
      'Living, 30 days old.',
    ])
  })

  it('names the cause of a death and uses the single-day wording', () => {
    const dead: StoryPerson = { ...base, alive: false, age: 600, death_cause: 'starvation' }
    expect(lifeStory(dead, [])).toEqual(['Died of starvation at 1 day old.'])
  })

  it('keeps the last major events, and leaves out the minor ones', () => {
    const events = [
      { category: 'witnessed', text: 'saw a storm' },
      { category: 'friendship', text: 'became close friends with Bo' },
      { category: 'loss', text: 'lost my beloved Bo' },
      { category: 'inheritance', text: 'inherited the family home from Mum' },
      { category: 'apprenticeship', text: 'apprenticed to Mum and took up their trade' },
    ]
    const story = lifeStory(base, [], events)
    expect(story).toEqual([
      'Lost my beloved Bo.',
      'Inherited the family home from Mum.',
      'Apprenticed to Mum and took up their trade.',
      'Living, 30 days old.',
    ])
  })

  it('reads a person with no family or trade as a short story', () => {
    expect(lifeStory({ ...base, alive: true, age: 0 }, [])).toEqual(['Living, 0 days old.'])
  })
})
