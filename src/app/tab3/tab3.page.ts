import { Component, inject, signal, computed } from '@angular/core';
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
  LoadingController,
  AlertController,
} from '@ionic/angular/standalone';
import { AsyncPipe, CommonModule } from '@angular/common';
import {
  Firestore,
  collection,
  addDoc,
  collectionData,
  doc,
  deleteDoc,
  query,
  orderBy,
  updateDoc,
} from '@angular/fire/firestore';
import {
  Storage,
  ref,
  uploadBytes,
  getDownloadURL,
} from '@angular/fire/storage';
import { Observable } from 'rxjs';
import { addIcons } from 'ionicons';
import { add, trash, camera, person, create, search } from 'ionicons/icons'; // <--- Aggiunto search

@Component({
  selector: 'app-tab3',
  templateUrl: 'tab3.page.html',
  styleUrls: ['tab3.page.scss'],
  standalone: true,
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
    IonSearchbar, // <--- Aggiunto
  ],
})
export class Tab3Page {
  private firestore = inject(Firestore);
  private storage = inject(Storage);
  private loadingController = inject(LoadingController);
  private alertController = inject(AlertController);

  // --- SIGNALS PER LA RICERCA ---
  tuttiIGiocatori = signal<any[]>([]);
  filtro = signal('');

  // --- STATO DELLA MODALE ---
  isModalOpen = signal(false);
  giocatoreInModificaId = signal<string | null>(null);

  nome = signal('');
  soprannome = signal('');
  annoNascita = signal('');
  piedePreferito = signal('Destro');
  altezza = signal('');
  peso = signal('');

  anteprimaFoto = signal<string | null>(null);
  fileSelezionato: File | null = null;

  // 🔥 RICERCA IBRIDA COMPUTED
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
    addIcons({ add, trash, camera, person, create, search });

    const giocatoriQuery = query(
      collection(this.firestore, 'giocatori'),
      orderBy('nome'),
    );

    // Carichiamo i dati nel signal invece di usare solo l'observable
    collectionData(giocatoriQuery, { idField: 'id' }).subscribe((data) => {
      this.tuttiIGiocatori.set(data);
    });
  }

  apriModale(g?: any) {
    if (g) {
      this.giocatoreInModificaId.set(g.id);
      this.nome.set(g.nome || '');
      this.soprannome.set(g.soprannome || '');
      this.annoNascita.set(g.annoNascita || '');
      this.piedePreferito.set(g.piedePreferito || 'Destro');
      this.altezza.set(g.altezza || '');
      this.peso.set(g.peso || '');
      this.anteprimaFoto.set(g.fotoUrl || null);
    } else {
      this.giocatoreInModificaId.set(null);
      this.nome.set('');
      this.soprannome.set('');
      this.annoNascita.set('');
      this.piedePreferito.set('Destro');
      this.altezza.set('');
      this.peso.set('');
      this.anteprimaFoto.set(null);
    }
    this.fileSelezionato = null;
    this.isModalOpen.set(true);
  }

  onFileSelected(event: any) {
    const file = event.target.files[0];
    if (file) {
      this.fileSelezionato = file;
      const reader = new FileReader();
      reader.onload = (e: any) => this.anteprimaFoto.set(e.target.result);
      reader.readAsDataURL(file);
    }
  }

  async salvaGiocatore() {
    if (!this.nome().trim()) return;

    const loading = await this.loadingController.create({
      message: 'Salvataggio...',
    });
    await loading.present();

    try {
      let fotoUrl =
        this.anteprimaFoto() ||
        'https://ionicframework.com/docs/img/demos/avatar.svg';

      if (this.fileSelezionato) {
        const path = `avatars/${Date.now()}_${this.fileSelezionato.name}`;
        const storageRef = ref(this.storage, path);
        await uploadBytes(storageRef, this.fileSelezionato);
        fotoUrl = await getDownloadURL(storageRef);
      }

      const payload = {
        nome: this.nome(),
        soprannome: this.soprannome(),
        annoNascita: this.annoNascita(),
        piedePreferito: this.piedePreferito(),
        altezza: this.altezza(),
        peso: this.peso(),
        fotoUrl: fotoUrl,
      };

      const id = this.giocatoreInModificaId();
      if (id) {
        await updateDoc(doc(this.firestore, `giocatori/${id}`), payload);
      } else {
        await addDoc(collection(this.firestore, 'giocatori'), {
          ...payload,
          gol: 0,
          punti: 0,
          mediaVoto: 0,
          partiteGiocate: 0,
        });
      }

      this.isModalOpen.set(false);
    } catch (e) {
      console.error(e);
    } finally {
      loading.dismiss();
    }
  }

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
