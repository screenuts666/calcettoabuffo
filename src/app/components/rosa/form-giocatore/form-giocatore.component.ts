import {
  Component,
  Input,
  Output,
  EventEmitter,
  inject,
  OnInit,
  ChangeDetectionStrategy,
  signal,
  ElementRef,
  ViewChild,
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
  LoadingController,
  ToastController,
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
import { addIcons } from 'ionicons';
import { createOutline } from 'ionicons/icons';
import { Giocatore } from 'src/app/models/giocatore.model';
import { AuthService } from 'src/app/services/auth.service';

const DEFAULT_AVATAR = 'https://ionicframework.com/docs/img/demos/avatar.svg';

@Component({
  selector: 'app-form-giocatore',
  templateUrl: './form-giocatore.component.html',
  styleUrls: ['./form-giocatore.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
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
  ],
})
export class FormGiocatoreComponent implements OnInit {
  private firestore = inject(Firestore);
  private storage = inject(Storage);
  private loadingController = inject(LoadingController);
  private toastController = inject(ToastController);
  private auth = inject(AuthService);

  @Input() giocatore: Giocatore | null = null;
  @Output() close = new EventEmitter<void>();

  nome = signal('');
  soprannome = signal('');
  annoNascita = signal('');
  piedePreferito = signal<'Destro' | 'Sinistro' | 'Ambidestro'>('Destro');
  altezza = signal('');
  peso = signal('');

  anteprimaFoto = signal<string | null>(null);
  fileSelezionato: File | null = null;

  @ViewChild('f') fileInput!: ElementRef<HTMLInputElement>;

  constructor() {
    addIcons({ createOutline });
  }

  get isAdmin(): boolean {
    return this.auth.isAdmin();
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

  openFilePicker() {
    if (!this.isAdmin) return;
    const el = this.fileInput?.nativeElement;
    if (!el) return;
    el.value = '';
    el.click();
  }

  onFileSelected(event: Event) {
    const file = (event.target as HTMLInputElement)?.files?.[0];
    if (file) {
      this.fileSelezionato = file;
      this.readFileAsDataURL(file)
        .then((d) => this.anteprimaFoto.set(d))
        .catch(() => {});
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
      let fotoUrl = this.anteprimaFoto() || DEFAULT_AVATAR;

      if (this.fileSelezionato) {
        const path = `avatars/${Date.now()}_${this.fileSelezionato.name}`;
        const storageRef = ref(this.storage, path);
        await uploadBytes(storageRef, this.fileSelezionato);
        fotoUrl = await getDownloadURL(storageRef);
      }

      const payload: Omit<
        Giocatore,
        'id' | 'gol' | 'punti' | 'mediaVoto' | 'partiteGiocate'
      > = {
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
      console.error('Errore nel salvataggio del giocatore:', e);
      const toast = await this.toastController.create({
        message: 'Errore durante il salvataggio. Riprova.',
        duration: 3000,
        color: 'danger',
        position: 'top',
      });
      toast.present();
    } finally {
      loading.dismiss();
    }
  }

  private readFileAsDataURL(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }
}
