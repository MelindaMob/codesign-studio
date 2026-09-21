import OpenAI from 'openai'

// 1536 dimensions : doit correspondre à vector(1536) dans le schéma SQL
const EMBED_MODEL = 'text-embedding-3-small'

export async function embedTexts(texts: string[]): Promise<number[][]> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error('OPENAI_API_KEY absente côté serveur')

  const openai = new OpenAI({ apiKey })
  const out: number[][] = []

  for (let i = 0; i < texts.length; i += 100) {
    const batch = texts.slice(i, i + 100)
    const res = await openai.embeddings.create({ model: EMBED_MODEL, input: batch })
    out.push(...res.data.map((d) => d.embedding))
  }

  return out
}
