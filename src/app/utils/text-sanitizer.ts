/**
 * Utility modulare per la sanitizzazione, pulizia del testo da markdown, emoji,
 * prompt preambles e calcolo di hash deterministici per TTS e condivisione.
 */

/**
 * Pulisce il testo da markdown, asterischi, underscore, URL ed emoji
 * per evitare letture robotizzate o caratteri strani da parte del sintetizzatore vocale.
 */
export function cleanTextForSpeech(rawText: string): string {
  if (!rawText) return '';
  let text = rawText;

  // 1. Rimuovi blocchi di codice e URL
  text = text.replace(/```[\s\S]*?```/g, ' ');
  text = text.replace(/https?:\/\/\S+/gi, ' ');

  // 2. Rimuovi link markdown [testo](url) lasciando solo il testo
  text = text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');

  // 3. Rimuovi formattazioni bold, italic, barrato, inline code
  text = text.replace(/(\*\*|__)(.*?)\1/g, '$2');
  text = text.replace(/(\*|_)(.*?)\1/g, '$2');
  text = text.replace(/`([^`]+)`/g, '$1');
  text = text.replace(/~~(.*?)~~/g, '$1');

  // 4. Rimuovi intestazioni markdown (#, ##, ###), blockquote (>) ed elenchi (- o *)
  text = text.replace(/^[#>\-\*]+\s+/gm, '');

  // 5. Rimuovi preamboli da prompt: se la prima riga/frase è un titolo o preambolo che finisce con ':' o a capo
  text = text.replace(/^(?:certamente|di seguito|va bene)[!,.:\s\n]+/i, '');
  text = text.replace(
    /^(?:ecco\s+[^:\n]+|telecronaca[^:\n]+|cronaca[^:\n]+|pronostico[^:\n]+|disamina[^:\n]+|verdetto[^:\n]+|scouting[^:\n]+|analisi\s+tattica[^:\n]+|scheda\s+tecnica[^:\n]+)[:\n]+/im,
    '',
  );

  text = text.replace(/\bSOPRANNOME:\s*/gi, '');
  text = text.replace(/\bSCOUTING:\s*/gi, '');

  // 6. Rimuovi simboli markdown residui e separatori
  text = text.replace(/[#\*_~`|]/g, ' ');

  // 7. Rimuovi sequenze di emoji per una lettura fluida
  text = text.replace(
    /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F1E0}-\u{1F1FF}\u{1F900}-\u{1F9FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}]/gu,
    ' ',
  );

  // 8. Rimuovi frecce o icone speciali
  text = text.replace(/[→←↑↓➜➤▶◀🎙️🔮✨🧙‍♂️📋💾🔄⚠️🎧⚽🔥💥]/g, ' ');

  // 9. Normalizza virgolette tipografiche e trattini
  text = text.replace(/[«»“”]/g, '"').replace(/[–—]/g, '-');

  // 10. Normalizza punteggiatura multipla e spazi bianchi
  text = text.replace(/\.{2,}/g, '.');
  text = text.replace(/\s+/g, ' ').trim();

  // 11. Se dopo la normalizzazione è rimasto un preambolo iniziale prima di due punti
  text = text.replace(
    /^(?:ecco\s+[^:]{3,60}|telecronaca[^:]{3,60}|cronaca[^:]{3,60}|pronostico[^:]{3,60})[:]\s*/i,
    '',
  );

  return text.trim();
}

/**
 * Genera un hash deterministico a 32-bit (djb2) del testo per garantire che modifiche
 * o rigenerazioni del testo producano una nuova chiave audio univoca.
 */
export function computeTextHash(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 33) ^ str.charCodeAt(i);
  }
  return (hash >>> 0).toString(36);
}
