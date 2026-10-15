import {
  Component,
  Input,
  ElementRef,
  ViewChild,
  inject,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  IonIcon,
  LoadingController,
  AlertController,
  ToastController,
  ModalController,
} from '@ionic/angular/standalone';
import {
  Storage,
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from '@angular/fire/storage';
import { doc, updateDoc } from '@angular/fire/firestore';
import { addIcons } from 'ionicons';
import {
  camera,
  cameraOutline,
  trashOutline,
  expandOutline,
  imageOutline,
  cloudUploadOutline,
} from 'ionicons/icons';
import { MatchStateService } from '../match-modal/match-state.service';
import { AuthService } from '../../../services/auth.service';
import { FotoViewerModalComponent } from '../foto-viewer-modal/foto-viewer-modal.component';
import { compressImage } from '../../../utils/image-utils';

@Component({
  selector: 'app-match-photo',
  templateUrl: './match-photo.component.html',
  styleUrls: ['./match-photo.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, IonIcon],
})
export class MatchPhotoComponent {
  public state = inject(MatchStateService);
  private storage = inject(Storage);
  private auth = inject(AuthService);
  private loadingCtrl = inject(LoadingController);
  private alertCtrl = inject(AlertController);
  private toastCtrl = inject(ToastController);
  private modalCtrl = inject(ModalController);
  private cdr = inject(ChangeDetectorRef);

  @Input() canEdit?: boolean;
  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;

  isUploading = false;

  constructor() {
    addIcons({
      camera,
      cameraOutline,
      trashOutline,
      expandOutline,
      imageOutline,
      cloudUploadOutline,
    });
  }

  get isAdmin(): boolean {
    return this.canEdit !== undefined
      ? this.canEdit
      : this.auth.isAdmin() || Boolean(this.state.matchDataOriginale?.isAdmin);
  }

  apriFilePicker() {
    if (!this.isAdmin) return;
    const input = this.fileInput?.nativeElement;
    if (input) {
      input.value = '';
      input.click();
    }
  }

  async onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    const loading = await this.loadingCtrl.create({
      message: 'Ottimizzazione e caricamento foto...',
      mode: 'ios',
    });
    await loading.present();

    try {
      this.isUploading = true;
      // 1. Comprimi immagine lato client per velocizzare l'upload e risparmiare storage
      const compressedBlob = await compressImage(file, 1600, 1600, 0.82);

      // 2. Prepara il path in Firebase Storage
      const matchId = this.state.matchId() || 'nuova';
      const timestamp = Date.now();
      const storagePath = `partite_foto/${matchId}_${timestamp}.jpg`;
      const storageRef = ref(this.storage, storagePath);

      // 3. Upload bytes
      await uploadBytes(storageRef, compressedBlob);
      const downloadUrl = await getDownloadURL(storageRef);

      // 4. Se c'era una vecchia foto in storage, eliminala per evitare file orfani
      const vecchiaFotoPath = this.state.fotoPath();
      if (vecchiaFotoPath) {
        try {
          const oldRef = ref(this.storage, vecchiaFotoPath);
          await deleteObject(oldRef);
        } catch (e) {
          console.warn('Impossibile rimuovere vecchia foto da storage:', e);
        }
      }

      // 5. Aggiorna stato locale
      this.state.fotoUrl.set(downloadUrl);
      this.state.fotoPath.set(storagePath);
      if (this.state.matchDataOriginale) {
        this.state.matchDataOriginale.fotoUrl = downloadUrl;
        this.state.matchDataOriginale.fotoPath = storagePath;
      }
      this.cdr.markForCheck();

      // 6. Se la partita è già salvata su Firestore, aggiorna il documento immediatamente
      if (this.state.matchId()) {
        const docRef = doc(this.state.firestore, `partite/${this.state.matchId()}`);
        await updateDoc(docRef, {
          fotoUrl: downloadUrl,
          fotoPath: storagePath,
        });
      }

      this.mostraToast('Foto di gruppo salvata con successo!', 'success');
    } catch (error) {
      console.error('Errore durante il caricamento della foto:', error);
      this.mostraToast('Errore durante il caricamento della foto. Riprova.', 'danger');
    } finally {
      this.isUploading = false;
      this.cdr.markForCheck();
      await loading.dismiss();
    }
  }

  async confermaRimozioneFoto() {
    if (!this.isAdmin) return;

    const alert = await this.alertCtrl.create({
      header: 'Rimuovi Foto',
      message: 'Sei sicuro di voler eliminare la foto di gruppo di questa partita?',
      buttons: [
        { text: 'Annulla', role: 'cancel' },
        {
          text: 'Rimuovi',
          role: 'destructive',
          handler: () => {
            this.rimuoviFoto();
          },
        },
      ],
    });

    await alert.present();
  }

  private async rimuoviFoto() {
    const loading = await this.loadingCtrl.create({
      message: 'Rimozione foto in corso...',
      mode: 'ios',
    });
    await loading.present();

    try {
      const storagePath = this.state.fotoPath();
      if (storagePath) {
        try {
          const storageRef = ref(this.storage, storagePath);
          await deleteObject(storageRef);
        } catch (e) {
          console.warn('Errore eliminazione foto da storage:', e);
        }
      }

      this.state.fotoUrl.set(null);
      this.state.fotoPath.set(null);
      if (this.state.matchDataOriginale) {
        this.state.matchDataOriginale.fotoUrl = null;
        this.state.matchDataOriginale.fotoPath = null;
      }
      this.cdr.markForCheck();

      if (this.state.matchId()) {
        const docRef = doc(this.state.firestore, `partite/${this.state.matchId()}`);
        await updateDoc(docRef, {
          fotoUrl: null,
          fotoPath: null,
        });
      }

      this.mostraToast('Foto rimossa.', 'success');
    } catch (error) {
      console.error('Errore durante la rimozione della foto:', error);
      this.mostraToast('Errore durante la rimozione della foto.', 'danger');
    } finally {
      this.cdr.markForCheck();
      await loading.dismiss();
    }
  }

  async apriFotoViewer() {
    const foto = this.state.fotoUrl();
    if (!foto) return;

    const modal = await this.modalCtrl.create({
      component: FotoViewerModalComponent,
      componentProps: {
        fotoUrl: foto,
        luogo: this.state.luogo(),
        dataPartita: this.state.dataPartita(),
        risultato: this.state.matchConcluso()
          ? `Bianchi ${this.state.scoreA()} - ${this.state.scoreB()} Neri`
          : undefined,
      },
    });

    await modal.present();
  }

  private async mostraToast(
    message: string,
    color: 'success' | 'warning' | 'danger' = 'success'
  ) {
    const toast = await this.toastCtrl.create({
      message,
      duration: 3000,
      position: 'bottom',
      color,
    });
    await toast.present();
  }
}
