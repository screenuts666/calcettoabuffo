/**
 * Utility per la formattazione sicura del markdown generato da Gemini AI in HTML.
 * Converte grassetti, corsivi, titoli, elenchi puntati e paragrafi.
 */
export function formatAiMarkdown(text: string | null | undefined): string {
  if (!text) return '';

  // Escape HTML base per sicurezza
  let formatted = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Titoli markdown ### o ##
  formatted = formatted.replace(/^###\s*(.*$)/gim, '<h4 class="ai-h4">$1</h4>');
  formatted = formatted.replace(/^##\s*(.*$)/gim, '<h3 class="ai-h3">$1</h3>');

  // Grassetti **testo**
  formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

  // Corsivo *testo*
  formatted = formatted.replace(/\*([^\*\n]+)\*/g, '<em>$1</em>');

  // Elenchi puntati (linee che iniziano con * o - o •)
  formatted = formatted.replace(/^\s*[\*\-•]\s+(.*$)/gim, '<li class="ai-li">$1</li>');

  // Suddivisione in paragrafi per i doppi a capo
  const paragraphs = formatted.split(/\n\n+/);
  return paragraphs
    .map((p) => {
      const trimmed = p.trim();
      if (!trimmed) return '';
      if (trimmed.startsWith('<h3') || trimmed.startsWith('<h4')) {
        return trimmed;
      }
      if (trimmed.includes('<li class="ai-li">')) {
        return `<ul class="ai-ul">${trimmed.replace(/\n/g, '')}</ul>`;
      }
      return `<p class="ai-p">${trimmed.replace(/\n/g, '<br/>')}</p>`;
    })
    .join('');
}
