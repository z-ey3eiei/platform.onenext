import { describe, expect, it } from 'vitest'
import { config, joinUrl, missingConfigKeys } from './config.ts'

describe('joinUrl', () => {
  it('does not double the slash', () => {
    expect(joinUrl('https://api.example.com/', '/v1/status')).toBe(
      'https://api.example.com/v1/status',
    )
  })

  it('passes absolute URLs through', () => {
    expect(joinUrl('https://api.example.com', 'https://cdn.example.com/a.png')).toBe(
      'https://cdn.example.com/a.png',
    )
  })

  it('adds a leading slash when base is empty', () => {
    expect(joinUrl('', 'status')).toBe('/status')
  })
})

describe('config', () => {
  it('has a usable app name', () => {
    expect(config.appName.length).toBeGreaterThan(0)
  })

  it('reports missing env vars instead of throwing', () => {
    expect(missingConfigKeys()).toEqual(['VITE_API_URL'])
  })
})
