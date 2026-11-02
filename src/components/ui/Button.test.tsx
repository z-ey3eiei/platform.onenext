import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { Button } from './Button.tsx'

describe('Button', () => {
  it('renders accessible text and clicks', () => {
    const onClick = vi.fn()
    render(<Button onClick={onClick}>Deploy</Button>)

    const button = screen.getByRole('button', { name: 'Deploy' })
    fireEvent.click(button)

    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('defaults to type=button so it cannot submit a form by accident', () => {
    render(<Button>Save</Button>)
    expect(screen.getByRole('button', { name: 'Save' })).toHaveAttribute(
      'type',
      'button',
    )
  })

  it('is inert when disabled', () => {
    render(<Button disabled>Save</Button>)
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })
})
