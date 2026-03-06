export interface Giocatore {
  id: string;
  nome: string;
  soprannome?: string;
  annoNascita?: string;
  piedePreferito?: 'Destro' | 'Sinistro' | 'Ambidestro';
  altezza?: string;
  peso?: string;
  fotoUrl?: string;
  gol: number;
  punti: number;
  mediaVoto: number;
  partiteGiocate: number;
}
