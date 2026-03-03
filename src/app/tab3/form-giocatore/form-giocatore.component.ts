import {
  Component,
  Input,
  Output,
  EventEmitter,
  inject,
  OnInit,
  ChangeDetectionStrategy,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonButtons,
  IonButton,
  IonItem,
  IonInput,
  IonSelect,
  IonSelectOption,
  IonAvatar,
  IonIcon,
  LoadingController,
} from '@ionic/angular/standalone';
import {
  Firestore,
  collection,
  addDoc,
  doc,
  updateDoc,
} from '@angular/fire/firestore';
import {
  Storage,
  ref,
  uploadBytes,
  getDownloadURL,
} from '@angular/fire/storage';
import { camera } from 'ionicons/icons';
import { addIcons } from 'ionicons';

@Component({
  selector: 'app-form-giocatore',
  templateUrl: './form-giocatore.component.html',
  styleUrls: ['./form-giocatore.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  // 🔥 IL FIX È QUI: Diciamo a Ionic di trattare questo componente come una pagina intera
  host: {
    class: 'ion-page',
  },
  imports: [
    CommonModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonButtons,
    IonButton,
    IonItem,
    IonInput,
    IonSelect,
    IonSelectOption,
    IonAvatar,
    IonIcon,
  ],
})
export class FormGiocatoreComponent implements OnInit {
  private firestore = inject(Firestore);
  private storage = inject(Storage);
  private loadingController = inject(LoadingController);

  @Input() giocatore: any;
  @Output() close = new EventEmitter<void>();

  nome = signal('');
  soprannome = signal('');
  annoNascita = signal('');
  piedePreferito = signal('Destro');
  altezza = signal('');
  peso = signal('');

  anteprimaFoto = signal<string | null>(null);
  fileSelezionato: File | null = null;

  constructor() {
    addIcons({ camera });
  }

  ngOnInit() {
    if (this.giocatore) {
      this.nome.set(this.giocatore.nome || '');
      this.soprannome.set(this.giocatore.soprannome || '');
      this.annoNascita.set(this.giocatore.annoNascita || '');
      this.piedePreferito.set(this.giocatore.piedePreferito || 'Destro');
      this.altezza.set(this.giocatore.altezza || '');
      this.peso.set(this.giocatore.peso || '');
      this.anteprimaFoto.set(this.giocatore.fotoUrl || null);
    }
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
      mode: 'ios',
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

      if (this.giocatore?.id) {
        await updateDoc(
          doc(this.firestore, `giocatori/${this.giocatore.id}`),
          payload,
        );
      } else {
        await addDoc(collection(this.firestore, 'giocatori'), {
          ...payload,
          gol: 0,
          punti: 0,
          mediaVoto: 0,
          partiteGiocate: 0,
        });
      }

      this.close.emit();
    } catch (e) {
      console.error(e);
    } finally {
      loading.dismiss();
    }
  }
}
