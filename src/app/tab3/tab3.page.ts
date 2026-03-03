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
import {
  Firestore,
  collection,
  collectionData,
  doc,
  deleteDoc,
  query,
  orderBy,
} from '@angular/fire/firestore';
import { addIcons } from 'ionicons';
import { add, trash, person, create, search } from 'ionicons/icons';

// Importiamo il nuovo Form
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
    FormGiocatoreComponent, // <--- IMPORTATO QUI
  ],
})
export class Tab3Page {
  private firestore = inject(Firestore);
  private alertController = inject(AlertController);

  tuttiIGiocatori = signal<any[]>([]);
  filtro = signal('');

  isModalOpen = signal(false);
  giocatoreInModifica = signal<any>(null); // Passiamo tutto l'oggetto, non solo l'ID

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
    addIcons({ add, trash, person, create, search });

    const giocatoriQuery = query(
      collection(this.firestore, 'giocatori'),
      orderBy('nome'),
    );
    collectionData(giocatoriQuery, { idField: 'id' }).subscribe((data) => {
      this.tuttiIGiocatori.set(data);
    });
  }

  apriModale(g?: any) {
    this.giocatoreInModifica.set(g || null);
    this.isModalOpen.set(true);
  }

  chiudiModale = () => {
    this.isModalOpen.set(false);
  };

  async eliminaGiocatore(id: string) {
    const alert = await this.alertController.create({
      header: 'Elimina Giocatore?',
      message: 'Sei sicuro? I suoi dati statistici andranno persi.',
      buttons: [
        { text: 'Annulla', role: 'cancel' },
        {
          text: 'Elimina',
          role: 'destructive',
          handler: () => deleteDoc(doc(this.firestore, `giocatori/${id}`)),
        },
      ],
    });
    await alert.present();
  }
}
