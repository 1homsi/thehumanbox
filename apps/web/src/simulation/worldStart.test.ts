import { describe, expect, it } from 'vitest'
import {
  freshWorldUsesHeadStart,
  isRedditArrival,
  isRedditReferrer,
  isRedditUtmSource,
  readWorldStartMode,
  resolveWorldStart,
  type WorldStartInput,
} from './worldStart'

function start(overrides: Partial<WorldStartInput> = {}): WorldStartInput {
  return {
    search: '',
    referrer: '',
    hasSavedWorld: false,
    explicitReset: false,
    explicitEmpty: false,
    explicitHeadStart: false,
    ...overrides,
  }
}

describe('Reddit arrival', () => {
  it('matches utm_source=reddit ignoring case', () => {
    expect(isRedditUtmSource('?utm_source=reddit')).toBe(true)
    expect(isRedditUtmSource('?utm_source=Reddit&utm_medium=post&utm_campaign=r_games')).toBe(true)
    expect(isRedditUtmSource('utm_source=%20REDDIT%20')).toBe(true)
  })

  it('ignores other sources and a missing tag', () => {
    expect(isRedditUtmSource('')).toBe(false)
    expect(isRedditUtmSource('?utm_medium=reddit')).toBe(false)
    expect(isRedditUtmSource('?utm_source=twitter')).toBe(false)
    expect(isRedditUtmSource('?utm_source=notreddit')).toBe(false)
  })

  it('accepts a referrer from reddit.com and its subdomains', () => {
    expect(isRedditReferrer('https://www.reddit.com/r/games/comments/abc')).toBe(true)
    expect(isRedditReferrer('https://old.reddit.com/')).toBe(true)
    expect(isRedditReferrer('https://reddit.com/r/worldbuilding')).toBe(true)
    expect(isRedditReferrer('http://np.reddit.com/r/x')).toBe(true)
  })

  it('rejects lookalike hosts and an empty referrer', () => {
    expect(isRedditReferrer('')).toBe(false)
    expect(isRedditReferrer('not a url')).toBe(false)
    expect(isRedditReferrer('https://notreddit.com/')).toBe(false)
    expect(isRedditReferrer('https://reddit.com.evil.test/')).toBe(false)
    expect(isRedditReferrer('https://www.reddit.com.evil.test/')).toBe(false)
  })

  it('counts either the tag or the referrer', () => {
    expect(isRedditArrival('?utm_source=reddit', '')).toBe(true)
    expect(isRedditArrival('', 'https://www.reddit.com/')).toBe(true)
    expect(isRedditArrival('?utm_source=google', 'https://old.reddit.com/r/x')).toBe(true)
    expect(isRedditArrival('?utm_source=newsletter', 'https://news.ycombinator.com/')).toBe(false)
  })
})

describe('default world start', () => {
  it('starts a Reddit arrival with no save in the head-start world', () => {
    expect(resolveWorldStart(start({ search: '?utm_source=reddit' }))).toBe('head_start_reddit')
    expect(resolveWorldStart(start({ referrer: 'https://www.reddit.com/r/games' }))).toBe('head_start_reddit')
    expect(freshWorldUsesHeadStart('head_start_reddit')).toBe(true)
  })

  it('starts everyone else at year one', () => {
    expect(resolveWorldStart(start())).toBe('year_one')
    expect(resolveWorldStart(start({ search: '?utm_source=twitter' }))).toBe('year_one')
    expect(freshWorldUsesHeadStart('year_one')).toBe(false)
  })

  it('resumes a saved world, including one opened from a Reddit link', () => {
    expect(resolveWorldStart(start({ hasSavedWorld: true }))).toBe('resume')
    expect(
      resolveWorldStart(
        start({ hasSavedWorld: true, search: '?utm_source=reddit', referrer: 'https://reddit.com/' }),
      ),
    ).toBe('resume')
    expect(freshWorldUsesHeadStart('resume')).toBe(false)
  })

  it('lets an explicit Settings choice win over a Reddit landing and over a save', () => {
    const reddit = { search: '?utm_source=reddit', referrer: 'https://www.reddit.com/' }
    expect(resolveWorldStart(start({ ...reddit, explicitEmpty: true }))).toBe('empty')
    expect(resolveWorldStart(start({ ...reddit, hasSavedWorld: true, explicitEmpty: true }))).toBe('empty')
    expect(resolveWorldStart(start({ ...reddit, explicitHeadStart: true }))).toBe('head_start')
    expect(resolveWorldStart(start({ ...reddit, hasSavedWorld: true, explicitHeadStart: true }))).toBe(
      'head_start',
    )
    expect(resolveWorldStart(start({ ...reddit, explicitReset: true }))).toBe('year_one')
    expect(resolveWorldStart(start({ ...reddit, hasSavedWorld: true, explicitReset: true }))).toBe('year_one')
    expect(freshWorldUsesHeadStart('head_start')).toBe(true)
    expect(freshWorldUsesHeadStart('empty')).toBe(false)
  })

  it('reads the start mode the worker reports and ignores anything else', () => {
    expect(readWorldStartMode('head_start_reddit')).toBe('head_start_reddit')
    expect(readWorldStartMode('year_one')).toBe('year_one')
    expect(readWorldStartMode('sideways')).toBeNull()
    expect(readWorldStartMode(undefined)).toBeNull()
  })
})
