// useCapture — estado do campo de captura rápida (texto → campos entendidos → chips).

import { useCallback, useMemo, useState } from 'react'
import { captureChips, removeTokens, type CaptureChip, type CaptureResult } from '../core/capture'
import { todayISO } from '../core/format'

export interface UseCapture {
  text: string
  setText: (t: string) => void
  result: CaptureResult
  chips: CaptureChip[]
  /** Remove do texto os tokens de um chip. */
  removeChip: (chip: CaptureChip) => void
  reset: () => void
}

export function useCapture(parser: (text: string) => CaptureResult, today?: string): UseCapture {
  const [text, setText] = useState('')
  const result = useMemo(() => parser(text), [parser, text])
  const chips = useMemo(() => captureChips(result, today ?? todayISO()), [result, today])
  const removeChip = useCallback((chip: CaptureChip) => setText(removeTokens(result, chip.tokenIdx)), [result])
  return { text, setText, result, chips, removeChip, reset: () => setText('') }
}
