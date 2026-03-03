import {
  Component,
  inject,
  signal,
  computed,
  ChangeDetectionStrategy,
} from '@angular/core';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonList,
  IonItem,
  IonAvatar,
  IonLabel,
  IonItemSliding,
  IonItemOptions,
  IonItemOption,
  IonIcon,
  IonSearchbar,
  AlertController,
  IonFab,
  IonModal,
  IonFabButton,
} from '@ionic/angular/standalone';
import { CommonModule } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  Firestore,
  collection,
  collectionData,
  doc,
  deleteDoc,
  query,
  orderBy,
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';
import { addIcons } from 'ionicons';
import {
  add,
  trash,
  person,
  create,
  search,
  closeCircle,
} from 'ionicons/icons';
import { FormGiocatoreComponent } from './form-giocatore/form-giocatore.component';

@Component({
  selector: 'app-tab3',
  templateUrl: 'tab3.page.html',
  styleUrls: ['tab3.page.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonList,
    IonItem,
    IonAvatar,
    IonLabel,
    IonItemSliding,
    IonItemOptions,
    IonItemOption,
    IonIcon,
    IonSearchbar,
    IonFab,
    IonFabButton,
    IonModal,
    FormGiocatoreComponent,
  ],
})
export class Tab3Page {
  private firestore = inject(Firestore);
  private alertController = inject(AlertController);

  filtro = signal('');
  isModalOpen = signal(false);
  giocatoreInModifica = signal<any>(null);

  // Caricamento dati con Signal
  tuttiIGiocatori = toSignal<any[], any[]>(
    collectionData(
      query(collection(this.firestore, 'giocatori'), orderBy('nome')),
      { idField: 'id' },
    ) as Observable<any[]>,
    { initialValue: [] },
  );

  // Ricerca reattiva
  giocatoriFiltrati = computed(() => {
    const f = this.filtro().toLowerCase().trim();
    const lista = this.tuttiIGiocatori();
    if (!f) return lista;
    return lista.filter((g) => {
      const nome = (g.nome || '').toLowerCase();
      const soprannome = (g.soprannome || '').toLowerCase();
      const anno = (g.annoNascita || '').toString();
      const piede = (g.piedePreferito || '').toLowerCase();
      return (
        nome.includes(f) ||
        soprannome.includes(f) ||
        anno.includes(f) ||
        piede.includes(f)
      );
    });
  });

  constructor() {
    addIcons({ add, trash, person, create, search, closeCircle });
  }

  // Sincronizzato con l'HTML (sia FAB che click su Item)
  apriModale(g?: any) {
    this.giocatoreInModifica.set(g || null);
    this.isModalOpen.set(true);
  }

  chiudiModale() {
    this.isModalOpen.set(false);
  }

  // Sincronizzato con ion-item-sliding dell'HTML
  async eliminaGiocatore(id: string, slidingItem: IonItemSliding) {
    const alert = await this.alertController.create({
      header: 'Elimina Giocatore?',
      message: 'Sei sicuro? I suoi dati statistici andranno persi.',
      buttons: [
        { text: 'Annulla', role: 'cancel', handler: () => slidingItem.close() },
        {
          text: 'Elimina',
          role: 'destructive',
          handler: async () => {
            await deleteDoc(doc(this.firestore, `giocatori/${id}`));
            slidingItem.close();
          },
        },
      ],
    });
    await alert.present();
  }
}
