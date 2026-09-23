import { PiedePreferito } from './piede-preferito.enum';
import { RuoloPreferito } from './ruolo-preferito.enum';

export interface Giocatore {
  id: string;
  nome: string;
  soprannome?: string;
  annoNascita?: string;
  piedePreferito?: PiedePreferito;
  ruoloPreferito?: RuoloPreferito;
  altezza?: string;
  peso?: string;
  fotoUrl?: string;
  gol: number;
  autogol?: number;
  punti: number;
  mediaVoto: number;
  partiteGiocate: number;
}
