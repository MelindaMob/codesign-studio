import type { ElementKind } from './schemas'

type GenerateParams = {
  sessionId: string
  type: ElementKind
  count?: number
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onElement: (el: any) => void
  onInvalid?: (info: unknown) => void
  onError?: (message: string) => void
}

export async function generateElements({
  sessionId,
  type,
  count = 3,
  onElement,
  onInvalid,
  onError,
}: GenerateParams) {
  const res = await fetch('/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, type, count }),
  })

  if (!res.ok || !res.body) {
    onError?.(await res.text())
    return
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })

    let i: number
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim()
      buf = buf.slice(i + 1)
      if (!line) continue

      const msg = JSON.parse(line)
      if (msg.type === 'element') onElement(msg.element)
      else if (msg.type === 'invalid') onInvalid?.(msg)
      else if (msg.type === 'error') onError?.(msg.message)
    }
  }
}
