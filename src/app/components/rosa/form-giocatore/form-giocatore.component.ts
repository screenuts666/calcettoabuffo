import {
  Component,
  Input,
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
  IonTextarea,
  IonSelect,
  IonSelectOption,
  IonAvatar,
  IonBackButton,
  IonIcon,
  LoadingController,
  ToastController,
} from '@ionic/angular/standalone';
import {
  collection,
  addDoc,
  doc,
  getDoc,
  updateDoc,
} from 'firebase/firestore';
import { Firestore } from '@angular/fire/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { Storage } from '@angular/fire/storage';
import { Subscription } from 'rxjs';
import { addIcons } from 'ionicons';
import {
  createOutline,
  arrowBack,
  cameraOutline,
  trashOutline,
  shieldCheckmarkOutline,
  personAddOutline,
  callOutline,
  lockClosedOutline,
} from 'ionicons/icons';
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
    IonTextarea,
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
  public auth = inject(AuthService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  @Input() giocatore: Giocatore | null = null;

  private routeSub?: Subscription;

  readonly PiedePreferito = PiedePreferito;
  readonly RuoloPreferito = RuoloPreferito;

  nome = signal('');
  soprannome = signal('');
  numeroMaglia = signal<string>('');
  bio = signal<string>('');
  annoNascita = signal('');
  piedePreferito = signal<PiedePreferito>(PiedePreferito.Destro);
  ruoloPreferito = signal<RuoloPreferito | null>(null);
  altezza = signal('');
  peso = signal('');
  professione = signal('');
  origini = signal('');
  statoCivile = signal('');
  vizi = signal('');
  phoneNumber = signal('');

  /**
   * Se `true`, in fase di creazione nuovo giocatore (`!giocatore?.id`),
   * aggancia automaticamente il nuovo giocatore all'utenza corrente (`users/{uid}`).
   */
  linkToMyAccount = signal<boolean>(false);

  anteprimaFoto = signal<string | null>(null);
  fileSelezionato: File | null = null;

  @ViewChild('f') fileInput!: ElementRef<HTMLInputElement>;

  constructor() {
    addIcons({
      createOutline,
      arrowBack,
      cameraOutline,
      trashOutline,
      shieldCheckmarkOutline,
      personAddOutline,
      callOutline,
      lockClosedOutline,
    });
  }

  get isAdmin(): boolean {
    return this.auth.isSuperUser();
  }

  /**
   * True se l'utente può salvare il form:
   * - Il Mister (`superuser`) può sempre creare o modificare.
   * - In modifica (`giocatore?.id`), l'Atleta proprietario può modificare la propria scheda.
   * - In creazione (`!giocatore?.id`), un utente autenticato senza giocatore associato (`!hasLinkedPlayer()`)
   *   può creare la propria scheda in rosa e agganciarla subito.
   */
  get canEdit(): boolean {
    if (this.auth.isSuperUser()) return true;
    if (this.giocatore?.id) {
      return this.auth.canEditPlayer(this.giocatore.id);
    }
    return this.auth.isAuthenticated() && !this.auth.hasLinkedPlayer();
  }

  /**
   * True se l'utente sta creando la PROPRIA scheda giocatore (non è Mister, oppure ha attivato il flag).
   */
  get isSelfRegistration(): boolean {
    if (this.giocatore?.id) return false;
    if (!this.auth.isSuperUser()) return true;
    return this.linkToMyAccount();
  }

  toggleLinkToMyAccount() {
    if (this.auth.isSuperUser()) {
      this.linkToMyAccount.update((v) => !v);
    }
  }

  ngOnInit() {
    if (this.giocatore) {
      this.popolaCampi(this.giocatore);
      return;
    }

    const selfClaimQuery =
      this.route.snapshot.queryParamMap.get('selfClaim') === '1';

    this.routeSub = this.route.paramMap.subscribe(async (params) => {
      const routeId = params.get('id');
      if (routeId && routeId !== 'nuovo') {
        try {
          const snap = await getDoc(
            doc(this.firestore, `giocatori/${routeId}`)
          );
          if (snap.exists()) {
            this.giocatore = { id: snap.id, ...snap.data() } as Giocatore;
            this.popolaCampi(this.giocatore);
          }
        } catch (err) {
          console.error('Errore caricamento giocatore per modifica:', err);
        }
      } else {
        this.giocatore = null;
        // Se non è Mister (o se ha aperto con ?selfClaim=1), precompila con i dati dell'account e attiva auto-link
        if (!this.auth.isSuperUser() || selfClaimQuery) {
          this.linkToMyAccount.set(true);
          const displayName = this.auth.displayName();
          if (displayName && displayName !== 'Tifoso' && !this.nome()) {
            this.nome.set(displayName);
          }
          const photo = this.auth.photoURL();
          if (photo && !this.anteprimaFoto()) {
            this.anteprimaFoto.set(photo);
          }
        }
      }
    });
  }

  ngOnDestroy() {
    this.routeSub?.unsubscribe();
  }

  private popolaCampi(g: Giocatore) {
    this.nome.set(g.nome || '');
    this.soprannome.set(g.soprannome || '');
    this.numeroMaglia.set(
      g.numeroMaglia !== undefined && g.numeroMaglia !== null
        ? String(g.numeroMaglia)
        : ''
    );
    this.bio.set(g.bio || '');
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

    if (g.id && this.auth.canViewPlayerPhone(g)) {
      this.auth.getPlayerPhoneNumber(g.id).then((phone) => {
        if (phone !== null) {
          this.phoneNumber.set(phone);
        }
      });
    }
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
    if (!this.canEdit) return;
    this.fileSelezionato = null;
    this.anteprimaFoto.set(null);
    if (this.fileInput?.nativeElement) {
      this.fileInput.nativeElement.value = '';
    }
  }

  openFilePicker() {
    if (!this.canEdit) return;
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
    if (!this.canEdit || !this.nome().trim()) return;

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
        const compressedBlob = await compressAvatar(
          this.fileSelezionato,
          384,
          0.82
        );
        const path = `avatars/${Date.now()}_avatar.jpg`;
        const storageRef = ref(this.storage, path);
        await uploadBytes(storageRef, compressedBlob, {
          contentType: 'image/jpeg',
        });
        fotoUrl = await getDownloadURL(storageRef);
      }

      const rawMaglia = this.numeroMaglia().toString().trim();
      const parsedMaglia = rawMaglia !== '' ? Number(rawMaglia) : null;

      // Payload rigorosamente allineato alle Field-Level Security Rules di `firestore.rules`
      const payload: Record<string, any> = {
        nome: this.nome().trim(),
        soprannome: this.soprannome().trim(),
        numeroMaglia:
          parsedMaglia !== null && !Number.isNaN(parsedMaglia)
            ? parsedMaglia
            : rawMaglia || null,
        bio: this.bio().trim(),
        annoNascita: this.annoNascita().toString().trim(),
        piedePreferito: this.piedePreferito(),
        ruoloPreferito: this.ruoloPreferito() ?? null,
        altezza: this.altezza().toString().trim(),
        peso: this.peso().toString().trim(),
        professione: this.professione().trim(),
        origini: this.origini().trim(),
        statoCivile: this.statoCivile().trim(),
        vizi: this.vizi().trim(),
        fotoUrl: fotoUrl,
        updatedAt: new Date().toISOString(),
      };

      if (this.giocatore?.id) {
        await updateDoc(
          doc(this.firestore, `giocatori/${this.giocatore.id}`),
          payload
        );
        await this.auth.savePlayerPhoneNumber(
          this.giocatore.id,
          this.phoneNumber()
        );
        await this.router.navigate(['/giocatori', this.giocatore.id]);
      } else if (this.isSelfRegistration) {
        // Utente che crea la propria scheda giocatore e aggancia subito l'utenza
        const newPlayerId = await this.auth.createAndClaimPlayer(
          payload,
          this.phoneNumber()
        );
        const toast = await this.toastController.create({
          message: `🎉 Benvenuto in Rosa, ${payload['nome']}! La tua scheda è ora collegata al tuo account.`,
          duration: 3000,
          color: 'success',
          position: 'top',
        });
        await toast.present();

        const queryReturn = this.route.snapshot.queryParamMap.get('returnUrl');
        const pendingReturn = this.auth.consumeReturnUrl();
        const targetReturn = queryReturn || pendingReturn;
        if (targetReturn && targetReturn.startsWith('/')) {
          await this.router.navigateByUrl(targetReturn);
        } else {
          await this.router.navigate(['/giocatori', newPlayerId]);
        }
      } else {
        // Mister che aggiunge un giocatore qualsiasi in rosa
        const newDocRef = await addDoc(collection(this.firestore, 'giocatori'), {
          ...payload,
          gol: 0,
          punti: 0,
          mediaVoto: 0,
          partiteGiocate: 0,
          linkedUid: null,
        });
        if (this.phoneNumber().trim()) {
          await this.auth.savePlayerPhoneNumber(
            newDocRef.id,
            this.phoneNumber()
          );
        }
        await this.router.navigate(['/rosa']);
      }
    } catch (e: any) {
      console.error('Errore nel salvataggio del giocatore:', e);
      const toast = await this.toastController.create({
        message:
          e?.message ||
          'Errore durante il salvataggio. Verifica i permessi e riprova.',
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
