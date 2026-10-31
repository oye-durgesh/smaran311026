import type { Lang } from '../domain/types'
import { recognitionSupported, startRecognition } from '../voice/speech'

/** One-shot speech-to-text for a form field. Reports unsupported browsers and denied permission honestly. */
export function startDictation(lang: Lang, onText: (t: string) => void, onProblem: (message: string) => void) {
  if (!recognitionSupported()) { onProblem("Speech input isn't supported in this browser. Please type instead."); return }
  startRecognition(lang, {
    onFinal: onText,
    onError: (e) => {
      if (e === 'permission-denied') onProblem('Microphone access is blocked. Allow it in your browser settings, or type instead.')
      else if (e === 'no-speech') onProblem("I didn't hear anything. Try again or type.")
      else if (e === 'audio-capture') onProblem('No microphone found. Please type instead.')
      else if (e === 'network') onProblem('Speech service unreachable. Please type instead.')
      else if (e !== 'aborted') onProblem('Could not listen. Please type instead.')
    },
    onEnd: () => undefined,
  })
}
