export interface CampoDaGioco {
  id: string; // slug univoco es. "roma-6", "vigor"
  nome: string; // "Roma 6"
  indirizzo?: string; // "Via di Roma 6, Roma"
  googleMapsUrl: string; // URL di navigazione Google Maps
  usatoCount?: number;
  ultimoUso?: string;
}

export const CAMPI_STORICI_SEED: CampoDaGioco[] = [
  {
    id: 'roma-6',
    nome: 'Roma 6',
    indirizzo: 'Via di Grotta Perfetta, Roma',
    googleMapsUrl: 'https://www.google.com/maps/search/?api=1&query=Roma+6+Calcio+Roma',
    usatoCount: 15,
  },
  {
    id: 'vigor',
    nome: 'Vigor',
    indirizzo: 'Centro Sportivo Vigor, Roma',
    googleMapsUrl: 'https://www.google.com/maps/search/?api=1&query=Centro+Sportivo+Vigor+Roma',
    usatoCount: 5,
  },
  {
    id: 'pro-roma',
    nome: 'Pro Roma',
    indirizzo: 'Centro Sportivo Pro Roma, Roma',
    googleMapsUrl: 'https://www.google.com/maps/search/?api=1&query=Pro+Roma+Calcio+Roma',
    usatoCount: 3,
  },
  {
    id: 'montesacro',
    nome: 'Montesacro',
    indirizzo: 'Montesacro, Roma',
    googleMapsUrl: 'https://www.google.com/maps/search/?api=1&query=Centro+Sportivo+Montesacro+Roma',
    usatoCount: 2,
  },
];

