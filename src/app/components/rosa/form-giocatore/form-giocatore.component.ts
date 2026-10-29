import {
  Component,
  Input,
  Output,
  EventEmitter,
  inject,
  OnInit,
  OnDestroy,
  ChangeDetectionStrategy,
  signal,
  ElementRef,
  ViewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
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
  IonBackButton,
  IonIcon,
  LoadingController,
  ToastController,
} from '@ionic/angular/standalone';
import {
  // Firestore token imported from @angular/fire/firestore
  collection,
  addDoc,
  doc,
  getDoc,
  updateDoc,
} from 'firebase/firestore';
import { Firestore } from '@angular/fire/firestore';
import {
  // Storage token imported from @angular/fire/storage
  ref,
  uploadBytes,
  getDownloadURL,
} from 'firebase/storage';
import { Storage } from '@angular/fire/storage';
import { Subscription } from 'rxjs';
import { addIcons } from 'ionicons';
import { createOutline, arrowBack, cameraOutline, trashOutline } from 'ionicons/icons';
import { Giocatore } from 'src/app/models/giocatore.model';
import { PiedePreferito } from 'src/app/models/piede-preferito.enum';
import { RuoloPreferito } from 'src/app/models/ruolo-preferito.enum';
import { AuthService } from 'src/app/services/auth.service';
import {
  DEFAULT_AVATAR,
  getAvatarUrl,
  handleAvatarError,
} from 'src/app/utils/avatar-utils';
import { compressAvatar } from 'src/app/utils/image-utils';

import { PlayerAvatarComponent } from '../../player-avatar/player-avatar.component';

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
    IonBackButton,
    IonItem,
    IonInput,
    IonSelect,
    IonSelectOption,
    IonAvatar,
    PlayerAvatarComponent,
    IonIcon,
  ],
})
export class FormGiocatoreComponent implements OnInit, OnDestroy {
  private firestore = inject(Firestore);
  private storage = inject(Storage);
  private loadingController = inject(LoadingController);
  private toastController = inject(ToastController);
  private auth = inject(AuthService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  @Input() giocatore: Giocatore | null = null;

  private routeSub?: Subscription;

  // Esponiamo gli enum al template
  readonly PiedePreferito = PiedePreferito;
  readonly RuoloPreferito = RuoloPreferito;

  nome = signal('');
  soprannome = signal('');
  annoNascita = signal('');
  piedePreferito = signal<PiedePreferito>(PiedePreferito.Destro);
  ruoloPreferito = signal<RuoloPreferito | null>(null);
  altezza = signal('');
  peso = signal('');
  professione = signal('');
  origini = signal('');
  statoCivile = signal('');
  vizi = signal('');

  anteprimaFoto = signal<string | null>(null);
  fileSelezionato: File | null = null;

  @ViewChild('f') fileInput!: ElementRef<HTMLInputElement>;

  constructor() {
    addIcons({ createOutline, arrowBack, cameraOutline, trashOutline });
  }

  get isAdmin(): boolean {
    return this.auth.isAdmin();
  }

  ngOnInit() {
    if (this.giocatore) {
      this.popolaCampi(this.giocatore);
      return;
    }

    this.routeSub = this.route.paramMap.subscribe(async (params) => {
      const routeId = params.get('id');
      if (routeId && routeId !== 'nuovo') {
        try {
          const snap = await getDoc(doc(this.firestore, `giocatori/${routeId}`));
          if (snap.exists()) {
            this.giocatore = { id: snap.id, ...snap.data() } as Giocatore;
            this.popolaCampi(this.giocatore);
          }
        } catch (err) {
          console.error('Errore caricamento giocatore per modifica:', err);
        }
      } else {
        this.giocatore = null;
      }
    });
  }

  ngOnDestroy() {
    this.routeSub?.unsubscribe();
  }

  private popolaCampi(g: Giocatore) {
    this.nome.set(g.nome || '');
    this.soprannome.set(g.soprannome || '');
    this.annoNascita.set(g.annoNascita || '');
    this.piedePreferito.set(g.piedePreferito ?? PiedePreferito.Destro);
    this.ruoloPreferito.set(g.ruoloPreferito ?? null);
    this.altezza.set(g.altezza || '');
    this.peso.set(g.peso || '');
    this.professione.set(g.professione || '');
    this.origini.set(g.origini || '');
    this.statoCivile.set(g.statoCivile || '');
    this.vizi.set(g.vizi || '');
    this.anteprimaFoto.set(g.fotoUrl || null);
  }

  annulla() {
    if (this.giocatore?.id) {
      this.router.navigate(['/giocatori', this.giocatore.id]);
    } else {
      this.router.navigate(['/rosa']);
    }
  }

  
  rimuoviFoto(event?: Event) {
    if (event) {
      event.stopPropagation();
    }
    this.fileSelezionato = null;
    this.anteprimaFoto.set(null);
    if (this.fileInput?.nativeElement) {
      this.fileInput.nativeElement.value = '';
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

  getAvatar(fotoUrl?: string | null): string {
    return getAvatarUrl(fotoUrl);
  }

  onImgError(event: Event) {
    handleAvatarError(event);
  }

  async salvaGiocatore() {
    if (!this.nome().trim()) return;

    const loading = await this.loadingController.create({
      message: 'Salvataggio...',
      mode: 'ios',
    });
    await loading.present();

    try {
      let fotoUrl = this.anteprimaFoto() || '';
      if (
        fotoUrl.includes('ionicframework.com') ||
        fotoUrl.includes('default-avatar.svg') ||
        fotoUrl === DEFAULT_AVATAR
      ) {
        fotoUrl = '';
      }

      if (this.fileSelezionato) {
        // Ottimizza e ridimensiona l'avatar prima dell'upload (max 384x384px, ~30-50KB)
        const compressedBlob = await compressAvatar(this.fileSelezionato, 384, 0.82);
        const path = `avatars/${Date.now()}_avatar.jpg`;
        const storageRef = ref(this.storage, path);
        await uploadBytes(storageRef, compressedBlob, { contentType: 'image/jpeg' });
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
        ruoloPreferito: this.ruoloPreferito() ?? undefined,
        altezza: this.altezza(),
        peso: this.peso(),
        professione: this.professione().trim(),
        origini: this.origini().trim(),
        statoCivile: this.statoCivile().trim(),
        vizi: this.vizi().trim(),
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

      if (this.giocatore?.id) {
        await this.router.navigate(['/giocatori', this.giocatore.id]);
      } else {
        await this.router.navigate(['/rosa']);
      }
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

export { FormGiocatoreComponent as GiocatoreEditPage };
