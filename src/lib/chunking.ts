// Découpe un texte en morceaux d'environ `size` caractères, avec un chevauchement,
// en essayant de couper en fin de phrase.
export function chunkText(text: string, size = 1000, overlap = 150): string[] {
  const clean = text.replace(/\s+/g, ' ').trim()
  const chunks: string[] = []
  let start = 0

  while (start < clean.length) {
    let end = Math.min(start + size, clean.length)

    if (end < clean.length) {
      const cut = clean.lastIndexOf('. ', end)
      if (cut > start + size * 0.5) end = cut + 1
    }

    chunks.push(clean.slice(start, end).trim())
    if (end >= clean.length) break
    start = end - overlap
  }

  // on ignore les morceaux trop courts (numéros de page, en-têtes...)
  return chunks.filter((c) => c.length > 40)
}