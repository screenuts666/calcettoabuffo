export interface CampoDaGioco {
  id: string; // slug univoco es. "roma-6", "vigor"
  nome: string; // "Roma 6"
  indirizzo?: string; // "Via di Roma 6, Roma"
  googleMapsUrl: string; // URL di navigazione Google Maps
  usatoCount?: number;
  ultimoUso?: string;
  isStorico?: boolean; // Vero per i 4 campi ufficiali storici del club
}

export const CAMPI_STORICI_SEED: CampoDaGioco[] = [
  {
    id: 'roma-6',
    nome: 'Roma 6',
    indirizzo: 'Via Latino Silvio, 10, 00177 Roma (Largo Preneste / Portonaccio)',
    googleMapsUrl:
      'https://www.google.com/maps/search/?api=1&query=Centro+Sportivo+Roma+6+Via+Latino+Silvio+10+Roma',
    usatoCount: 15,
    isStorico: true,
  },
  {
    id: 'montesacro',
    nome: 'Montesacro Calcio',
    indirizzo: 'Via Clelia Bertini Attilj, 35, 00141 Roma (Talenti / Montesacro)',
    googleMapsUrl:
      'https://www.google.com/maps/search/?api=1&query=Montesacro+Calcio+Via+Clelia+Bertini+Attilj+35+Roma',
    usatoCount: 2,
    isStorico: true,
  },
  {
    id: 'vigor',
    nome: 'Vigor Perconti',
    indirizzo: 'Via Grotta di Gregna, 100, 00155 Roma (Colli Aniene)',
    googleMapsUrl:
      'https://www.google.com/maps/search/?api=1&query=Centro+Sportivo+Vigor+Perconti+Via+Grotta+di+Gregna+100+Roma',
    usatoCount: 5,
    isStorico: true,
  },
  {
    id: 'pro-roma',
    nome: 'Pro Roma',
    indirizzo: 'Via Verrio Flacco, 41, 00174 Roma (Quadraro / Tuscolano)',
    googleMapsUrl:
      'https://www.google.com/maps/search/?api=1&query=Centro+Sportivo+Pro+Roma+Calcio+Via+Verrio+Flacco+41+Roma',
    usatoCount: 3,
    isStorico: true,
  },
];

