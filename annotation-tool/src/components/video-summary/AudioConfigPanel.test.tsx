/**
 * Tests for AudioConfigPanel component.
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AudioConfigPanel } from './AudioConfigPanel'
import { AudioConfig } from './types.js'

const defaultConfig: AudioConfig = {
  enable_audio: false,
  enable_speaker_diarization: false,
  fusion_strategy: 'sequential',
}

const enabledConfig: AudioConfig = {
  enable_audio: true,
  enable_speaker_diarization: true,
  fusion_strategy: 'timestamp_aligned',
  audio_language: 'en',
}

describe('AudioConfigPanel', () => {
  describe('Initial Render', () => {
    it('renders audio processing options heading', () => {
      const onChange = vi.fn()
      render(<AudioConfigPanel config={defaultConfig} onChange={onChange} />)

      expect(screen.getByText('Audio Processing Options')).toBeInTheDocument()
    })

    it('renders all form controls', () => {
      const onChange = vi.fn()
      render(<AudioConfigPanel config={defaultConfig} onChange={onChange} />)

      expect(screen.getByLabelText('Enable Audio Transcription')).toBeInTheDocument()
      expect(screen.getByLabelText('Enable Speaker Diarization')).toBeInTheDocument()
      expect(screen.getByLabelText('Fusion Strategy')).toBeInTheDocument()
      expect(screen.getByLabelText(/Audio Language/i)).toBeInTheDocument()
    })

    it('displays config values correctly', () => {
      const onChange = vi.fn()
      render(<AudioConfigPanel config={enabledConfig} onChange={onChange} />)

      const audioCheckbox = screen.getByLabelText('Enable Audio Transcription') as HTMLInputElement
      const diarizationCheckbox = screen.getByLabelText('Enable Speaker Diarization') as HTMLInputElement
      const languageInput = screen.getByLabelText(/Audio Language/i) as HTMLInputElement

      expect(audioCheckbox.checked).toBe(true)
      expect(diarizationCheckbox.checked).toBe(true)
      expect(languageInput.value).toBe('en')
    })
  })

  describe('Enable Audio Checkbox', () => {
    it('calls onChange when audio checkbox is toggled on', async () => {
      const onChange = vi.fn()
      const user = userEvent.setup()

      render(<AudioConfigPanel config={defaultConfig} onChange={onChange} />)

      const checkbox = screen.getByLabelText('Enable Audio Transcription')
      await user.click(checkbox)

      expect(onChange).toHaveBeenCalledWith({
        ...defaultConfig,
        enable_audio: true,
      })
    })

    it('calls onChange when audio checkbox is toggled off', async () => {
      const onChange = vi.fn()
      const user = userEvent.setup()

      render(<AudioConfigPanel config={enabledConfig} onChange={onChange} />)

      const checkbox = screen.getByLabelText('Enable Audio Transcription')
      await user.click(checkbox)

      expect(onChange).toHaveBeenCalledWith({
        ...enabledConfig,
        enable_audio: false,
        enable_speaker_diarization: false,
      })
    })

    it('disables speaker diarization when audio is disabled', async () => {
      const onChange = vi.fn()
      const user = userEvent.setup()

      const config: AudioConfig = {
        enable_audio: true,
        enable_speaker_diarization: true,
        fusion_strategy: 'sequential',
      }

      render(<AudioConfigPanel config={config} onChange={onChange} />)

      const audioCheckbox = screen.getByLabelText('Enable Audio Transcription')
      await user.click(audioCheckbox)

      expect(onChange).toHaveBeenCalledWith({
        ...config,
        enable_audio: false,
        enable_speaker_diarization: false,
      })
    })
  })

  describe('Enable Speaker Diarization Checkbox', () => {
    it('calls onChange when diarization checkbox is toggled', async () => {
      const onChange = vi.fn()
      const user = userEvent.setup()

      const config: AudioConfig = {
        ...defaultConfig,
        enable_audio: true,
      }

      render(<AudioConfigPanel config={config} onChange={onChange} />)

      const checkbox = screen.getByLabelText('Enable Speaker Diarization')
      await user.click(checkbox)

      expect(onChange).toHaveBeenCalledWith({
        ...config,
        enable_speaker_diarization: true,
      })
    })

    it('is disabled when audio is not enabled', () => {
      const onChange = vi.fn()

      render(<AudioConfigPanel config={defaultConfig} onChange={onChange} />)

      const checkbox = screen.getByLabelText('Enable Speaker Diarization') as HTMLInputElement
      expect(checkbox.disabled).toBe(true)
    })

    it('is enabled when audio is enabled', () => {
      const onChange = vi.fn()

      const config: AudioConfig = {
        ...defaultConfig,
        enable_audio: true,
      }

      render(<AudioConfigPanel config={config} onChange={onChange} />)

      const checkbox = screen.getByLabelText('Enable Speaker Diarization') as HTMLInputElement
      expect(checkbox.disabled).toBe(false)
    })
  })

  describe('Fusion Strategy Selector', () => {
    it('displays current fusion strategy', () => {
      const onChange = vi.fn()

      render(<AudioConfigPanel config={enabledConfig} onChange={onChange} />)

      // Check that the fusion strategy label is present
      expect(screen.getByLabelText('Fusion Strategy')).toBeInTheDocument()
      // And that the description for timestamp_aligned is shown
      expect(
        screen.getByText(/Synchronize audio and visual events by timestamp/i)
      ).toBeInTheDocument()
    })

    it('calls onChange when fusion strategy changes', async () => {
      const onChange = vi.fn()
      const user = userEvent.setup()

      render(<AudioConfigPanel config={enabledConfig} onChange={onChange} />)

      const select = screen.getByLabelText('Fusion Strategy')
      await user.click(select)

      const option = screen.getByRole('option', { name: /Hybrid/i })
      await user.click(option)

      expect(onChange).toHaveBeenCalledWith({
        ...enabledConfig,
        fusion_strategy: 'hybrid',
      })
    })

    it('displays all fusion strategy options', async () => {
      const onChange = vi.fn()
      const user = userEvent.setup()

      render(<AudioConfigPanel config={enabledConfig} onChange={onChange} />)

      const select = screen.getByLabelText('Fusion Strategy')
      await user.click(select)

      expect(screen.getByRole('option', { name: /Sequential/i })).toBeInTheDocument()
      expect(screen.getByRole('option', { name: /Timestamp Aligned/i })).toBeInTheDocument()
      expect(screen.getByRole('option', { name: /Native Multimodal/i })).toBeInTheDocument()
      expect(screen.getByRole('option', { name: /Hybrid/i })).toBeInTheDocument()
    })

    it('is disabled when audio is not enabled', async () => {
      const onChange = vi.fn()
      const user = userEvent.setup()

      render(<AudioConfigPanel config={defaultConfig} onChange={onChange} />)

      // Try to interact with the fusion strategy field - it should not trigger onChange
      const fusionStrategyField = screen.getByLabelText('Fusion Strategy')
      await user.click(fusionStrategyField)

      // Verify onChange was not called because the field is disabled
      expect(onChange).not.toHaveBeenCalled()
    })

    it('displays description for selected strategy', () => {
      const onChange = vi.fn()

      render(<AudioConfigPanel config={enabledConfig} onChange={onChange} />)

      expect(
        screen.getByText(/Synchronize audio and visual events by timestamp/i)
      ).toBeInTheDocument()
    })
  })

  describe('Audio Language Input', () => {
    it('displays current language value', () => {
      const onChange = vi.fn()

      render(<AudioConfigPanel config={enabledConfig} onChange={onChange} />)

      const input = screen.getByLabelText(/Audio Language/i) as HTMLInputElement
      expect(input.value).toBe('en')
    })

    it('calls onChange when language is entered', async () => {
      const onChange = vi.fn()
      const user = userEvent.setup()

      const config: AudioConfig = {
        enable_audio: true,
        enable_speaker_diarization: false,
        fusion_strategy: 'sequential',
        audio_language: undefined,
      }

      render(<AudioConfigPanel config={config} onChange={onChange} />)

      const input = screen.getByLabelText(/Audio Language/i)
      await user.type(input, 'e')

      // Check that onChange was called at least once with the expected character
      expect(onChange).toHaveBeenCalledWith({
        ...config,
        audio_language: 'e',
      })
    })

    it('sets audio_language to undefined when input is empty', async () => {
      const onChange = vi.fn()
      const user = userEvent.setup()

      render(<AudioConfigPanel config={enabledConfig} onChange={onChange} />)

      const input = screen.getByLabelText(/Audio Language/i)
      await user.clear(input)

      expect(onChange).toHaveBeenCalledWith({
        ...enabledConfig,
        audio_language: undefined,
      })
    })

    it('is disabled when audio is not enabled', () => {
      const onChange = vi.fn()

      render(<AudioConfigPanel config={defaultConfig} onChange={onChange} />)

      const input = screen.getByLabelText(/Audio Language/i) as HTMLInputElement
      expect(input.disabled).toBe(true)
    })

    it('displays helper text about ISO codes', () => {
      const onChange = vi.fn()

      render(<AudioConfigPanel config={defaultConfig} onChange={onChange} />)

      expect(
        screen.getByText(/ISO language code.*Leave empty for auto-detection/i)
      ).toBeInTheDocument()
    })
  })

  describe('Disabled State', () => {
    it('disables checkboxes and text field when disabled prop is true', () => {
      const onChange = vi.fn()

      render(<AudioConfigPanel config={enabledConfig} onChange={onChange} disabled={true} />)

      const audioCheckbox = screen.getByLabelText('Enable Audio Transcription') as HTMLInputElement
      const diarizationCheckbox = screen.getByLabelText('Enable Speaker Diarization') as HTMLInputElement
      const languageInput = screen.getByLabelText(/Audio Language/i) as HTMLInputElement

      expect(audioCheckbox.disabled).toBe(true)
      expect(diarizationCheckbox.disabled).toBe(true)
      expect(languageInput.disabled).toBe(true)
    })

    it('enables checkboxes and text field when disabled prop is false', () => {
      const onChange = vi.fn()

      render(<AudioConfigPanel config={enabledConfig} onChange={onChange} disabled={false} />)

      const audioCheckbox = screen.getByLabelText('Enable Audio Transcription') as HTMLInputElement
      const diarizationCheckbox = screen.getByLabelText('Enable Speaker Diarization') as HTMLInputElement
      const languageInput = screen.getByLabelText(/Audio Language/i) as HTMLInputElement

      expect(audioCheckbox.disabled).toBe(false)
      expect(diarizationCheckbox.disabled).toBe(false)
      expect(languageInput.disabled).toBe(false)
    })
  })

  describe('Integration Scenarios', () => {
    it('handles complete workflow from disabled to fully enabled', async () => {
      const onChange = vi.fn()
      const user = userEvent.setup()

      const { rerender } = render(<AudioConfigPanel config={defaultConfig} onChange={onChange} />)

      // Enable audio
      const audioCheckbox = screen.getByLabelText('Enable Audio Transcription')
      await user.click(audioCheckbox)
      expect(onChange).toHaveBeenLastCalledWith({
        ...defaultConfig,
        enable_audio: true,
      })

      // Update config to reflect audio enabled
      const audioEnabledConfig: AudioConfig = {
        ...defaultConfig,
        enable_audio: true,
      }
      rerender(<AudioConfigPanel config={audioEnabledConfig} onChange={onChange} />)

      // Enable speaker diarization
      const diarizationCheckbox = screen.getByLabelText('Enable Speaker Diarization')
      await user.click(diarizationCheckbox)
      expect(onChange).toHaveBeenLastCalledWith({
        ...audioEnabledConfig,
        enable_speaker_diarization: true,
      })

      // Change fusion strategy
      const fullConfig: AudioConfig = {
        ...audioEnabledConfig,
        enable_speaker_diarization: true,
      }
      rerender(<AudioConfigPanel config={fullConfig} onChange={onChange} />)

      const select = screen.getByLabelText('Fusion Strategy')
      await user.click(select)
      const hybridOption = screen.getByRole('option', { name: /Hybrid/i })
      await user.click(hybridOption)

      expect(onChange).toHaveBeenLastCalledWith({
        ...fullConfig,
        fusion_strategy: 'hybrid',
      })
    })
  })
})
