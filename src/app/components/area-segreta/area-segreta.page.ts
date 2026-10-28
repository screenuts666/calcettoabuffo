import {
  Component,
  ChangeDetectionStrategy,
  computed,
  inject,
  signal,
  OnDestroy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonButtons,
  IonButton,
  IonIcon,
  IonBackButton,
  AlertController,
  ToastController,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  shieldCheckmark,
  lockClosed,
  lockOpen,
  calculator,
  people,
  football,
  flask,
  key,
  construct,
  chevronDown,
  chevronUp,
  checkmarkCircle,
  closeCircle,
  warning,
  refresh,
  search,
  informationCircle,
  flash,
  trophy,
  analytics,
  layers,
  eye,
  timeOutline,
  arrowBack,
  cloudUpload,
  cloudDone,
} from 'ionicons/icons';
import { AuthService } from 'src/app/services/auth.service';
import { DevDbSyncService } from 'src/app/services/dev-db-sync.service';
import {
  StatsEngineService,
  BASE_INITIAL_MMR,
  K_FACTOR,
  SEED_CLAMP_MIN,
  SEED_CLAMP_MAX,
  SOFT_RESET_FACTOR,
  PLACEMENT_MULTIPLIER,
  PLACEMENT_CLAMP_MIN,
  PLACEMENT_CLAMP_MAX,
  HARD_CLAMP_MIN,
  HARD_CLAMP_MAX,
  MIN_MATCHES_CHEMISTRY,
} from 'src/app/services/stats-engine.service';
import {
  MMR_TIERS,
  MmrTier,
  UNRANKED_TIER,
} from 'src/app/models/mmr.model';
import {
  SeasonEngineConfig,
  getDefaultSeasonConfig,
  seasonToDocId,
} from 'src/app/models/season-config.model';
import {
  ALL_SEASONS,
  CURRENT_SEASON,
  PREVIOUS_SEASON,
  getStagionePartita,
  getStagioniDisponibili,
  parseDate,
} from 'src/app/utils/season-utils';
import { getAvatarUrl } from 'src/app/utils/avatar-utils';
import { PlayerAvatarComponent } from '../player-avatar/player-avatar.component';
import { ThemeToggleComponent } from '../theme-toggle/theme-toggle.component';

export type SecretTab = 'parametri' | 'giocatori' | 'partite' | 'simulatore';

export interface PlayerMatchAuditRow {
  partitaId: string;
  data: string;
  stagione: string;
  team: 'A' | 'B';
  result: 'W' | 'D' | 'L';
  scoreStr: string;
  mmrBefore: number;
  teamAvgMmr: number;
  oppAvgMmr: number;
  winProbPercent: number;
  baseTeamDelta: number;
  movBonus: number;
  ratingBonus: number;
  contributionBonus: number;
  streakBonus: number;
  gkBonus: number;
  eliteBrake: number;
  isPlacement: boolean;
  mmrDelta: number;
  mmrAfter: number;
  voto: number;
  gol: number;
  autogol: number;
  assist: number;
  puntiPresenza: number;
  puntiEsito: number;
  puntiGol: number;
  puntiAutogol: number;
  puntiAssist: number;
  puntiVoto: number;
  legacyTotalMatch: number;
}

export interface PlayerXRayAudit {
  id: string;
  nome: string;
  soprannome?: string;
  fotoUrl: string;
  partiteGiocate: number;
  wins: number;
  draws: number;
  losses: number;
  winRate: number;
  puntiPresenzaTot: number;
  puntiVittorieTot: number;
  puntiPareggiTot: number;
  golTotali: number;
  puntiGolTot: number;
  autogolTotali: number;
  puntiAutogolTot: number;
  assistTotali: number;
  puntiAssistTot: number;
  sommaVoti: number;
  mediaVoto: number;
  puntiLegacyTotali: number;
  seasonStartMmr: number;
  prevSeasonFinalMmr: number | null;
  softResetFormulaStr: string;
  currentMmr: number;
  peakMmr: number;
  lowestMmr: number;
  netMmrGain: number;
  tier: MmrTier;
  streak: number;
  formLabel: string;
  fenomenoCheck: {
    mmrRequired: number;
    mmrOk: boolean;
    matchesRequired: number;
    matchesOk: boolean;
    rankMmr: number;
    maxSlots: number;
    slotOk: boolean;
    isFenomeno: boolean;
  };
  gk: {
    minutiInPorta: number;
    turniInPorta: number;
    golSubiti: number;
    cleanSheetTurni: number;
    mediaGolSubiti50m: number;
    isClassificabile: boolean;
    formulaStr: string;
  };
  bestPartnerStr: string;
  nemesisStr: string;
  matchRows: PlayerMatchAuditRow[];
}

export interface MatchAuditSheet {
  id: string;
  data: string;
  luogo: string;
  stagione: string;
  scoreA: number;
  scoreB: number;
  avgMmrA: number;
  avgMmrB: number;
  probAPercent: number;
  probBPercent: number;
  baseDeltaA: number;
  baseDeltaB: number;
  movBonusA: number;
  movBonusB: number;
  rowsA: (PlayerMatchAuditRow & { playerId: string; nome: string; fotoUrl: string })[];
  rowsB: (PlayerMatchAuditRow & { playerId: string; nome: string; fotoUrl: string })[];
}

@Component({
  selector: 'app-area-segreta',
  templateUrl: './area-segreta.page.html',
  styleUrls: ['./area-segreta.page.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    FormsModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonButtons,
    IonButton,
    IonIcon,
    IonBackButton,
    PlayerAvatarComponent,
    ThemeToggleComponent,
  ],
})
export class AreaSegretaPage implements OnDestroy {
  private authService = inject(AuthService);
  private statsEngine = inject(StatsEngineService);
  private alertCtrl = inject(AlertController);
  private toastCtrl = inject(ToastController);
  private router = inject(Router);
  public devDbSync = inject(DevDbSyncService);

  readonly BASE_INITIAL_MMR = BASE_INITIAL_MMR;
  readonly K_FACTOR = K_FACTOR;
  readonly SEED_CLAMP_MIN = SEED_CLAMP_MIN;
  readonly SEED_CLAMP_MAX = SEED_CLAMP_MAX;
  readonly SOFT_RESET_FACTOR = SOFT_RESET_FACTOR;
  readonly PLACEMENT_MULTIPLIER = PLACEMENT_MULTIPLIER;
  readonly PLACEMENT_CLAMP_MIN = PLACEMENT_CLAMP_MIN;
  readonly PLACEMENT_CLAMP_MAX = PLACEMENT_CLAMP_MAX;
  readonly HARD_CLAMP_MIN = HARD_CLAMP_MIN;
  readonly HARD_CLAMP_MAX = HARD_CLAMP_MAX;
  readonly MIN_MATCHES_CHEMISTRY = MIN_MATCHES_CHEMISTRY;
  readonly MMR_TIERS = MMR_TIERS;
  readonly ALL_SEASONS = ALL_SEASONS;
  readonly CURRENT_SEASON = CURRENT_SEASON;
  readonly PREVIOUS_SEASON = PREVIOUS_SEASON;

  activeTab = signal<SecretTab>('parametri');
  // Stagione selezionata per i Raggi X Giocatori e Audit Partite (include 'all')
  stagioneSelezionata = signal<string>(CURRENT_SEASON);
  // Stagione selezionata in Tab 1 "Regole" (solo stagioni specifiche es. 2026/2027, 2025/2026)
  regoleStagione = signal<string>(CURRENT_SEASON);

  searchPlayer = signal<string>('');
  expandedPlayerId = signal<string | null>(null);
  expandedMatchId = signal<string | null>(null);

  isAdmin = this.authService.isAdmin;
  isVaultUnlocked = this.authService.isVaultUnlocked;
  vaultRemainingSeconds = signal<number>(0);
  private countdownInterval: ReturnType<typeof setInterval> | null = null;

  // Bozza locale per modifiche per-stagione prima del salvataggio su Firebase
  draftBySeason = signal<Record<string, Partial<SeasonEngineConfig>>>({});

  // Simulatore "What-If" Singola Partita
  simInput = signal({
    playerMmrBefore: 1050,
    teamAvgMmr: 1040,
    oppAvgMmr: 1080,
    teamScore: 7,
    oppScore: 5,
    voto: 7.0,
    gol: 2,
    autogol: 0,
    assist: 1,
    streakBefore: 2,
    gkTurni: 1,
    gkGolSubiti: 0,
    gkCleanSheetTurni: 1,
    isPlacement: false,
  });

  stagioniList = computed(() => {
    const partite = this.statsEngine.partiteRaw() || [];
    const savedSeasonKeys = Array.from(
      this.statsEngine.seasonConfigsMap().keys(),
    ).map((stagione) => ({ stagione }));
    return getStagioniDisponibili([...partite, ...savedSeasonKeys]);
  });

  // Lista delle sole stagioni singole (es. 2026/2027, 2025/2026) per la configurazione Firebase per-stagione
  stagioniSingoleList = computed(() => {
    return this.stagioniList().filter((s) => s.id !== ALL_SEASONS);
  });

  // Configurazione attiva della stagione selezionata nel tab Regole
  sandboxParams = computed<SeasonEngineConfig>(() => {
    const sId = this.regoleStagione();
    const savedOrDefault = this.statsEngine.getSeasonConfig(sId);
    const draft = this.draftBySeason()[sId] || {};
    return {
      ...savedOrDefault,
      ...draft,
      seasonId: sId,
      docId: seasonToDocId(sId),
    };
  });

  isCurrentRegoleSavedInFirebase = computed<boolean>(() => {
    return this.statsEngine.isSeasonInFirestore(this.regoleStagione());
  });

  hasUnsavedDraft = computed<boolean>(() => {
    const sId = this.regoleStagione();
    return Object.keys(this.draftBySeason()[sId] || {}).length > 0;
  });

  // Una stagione è modificabile SOLO se il Super-Lock è sbloccato E la stagione non ha il sigillo "Stagione Conclusa"
  canEditSelectedSeason = computed<boolean>(() => {
    return this.isVaultUnlocked() && !this.sandboxParams().isSeasonLocked;
  });

  constructor() {
    addIcons({
      shieldCheckmark,
      lockClosed,
      lockOpen,
      calculator,
      people,
      football,
      flask,
      key,
      construct,
      chevronDown,
      chevronUp,
      checkmarkCircle,
      closeCircle,
      warning,
      refresh,
      search,
      informationCircle,
      flash,
      trophy,
      analytics,
      layers,
      eye,
      timeOutline,
      arrowBack,
      cloudUpload,
      cloudDone,
    });

    this.countdownInterval = setInterval(() => {
      const exp = this.authService.vaultExpiresAt();
      if (exp && this.authService.isVaultUnlocked()) {
        const diff = Math.max(0, Math.floor((exp - Date.now()) / 1000));
        this.vaultRemainingSeconds.set(diff);
        if (diff <= 0) {
          this.authService.lockVault();
        }
      } else {
        this.vaultRemainingSeconds.set(0);
      }
    }, 1000);
  }

  ngOnDestroy() {
    if (this.countdownInterval) {
      clearInterval(this.countdownInterval);
    }
  }

  setTab(tab: SecretTab) {
    this.activeTab.set(tab);
  }

  setStagione(stagione: string) {
    this.stagioneSelezionata.set(stagione);
    if (stagione !== ALL_SEASONS) {
      this.regoleStagione.set(stagione);
    }
  }

  setRegoleStagione(stagione: string) {
    this.regoleStagione.set(stagione);
    this.stagioneSelezionata.set(stagione);
  }

  togglePlayerExpand(id: string) {
    this.expandedPlayerId.update((prev) => (prev === id ? null : id));
  }

  toggleMatchExpand(id: string) {
    this.expandedMatchId.update((prev) => (prev === id ? null : id));
  }

  formatCountdown(sec: number): string {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  }

  // =========================================================================
  // 2° LIVELLO DI SICUREZZA: SBLOCCO SUPER-LOCK & SALVATAGGIO STAGIONALE FIREBASE
  // =========================================================================
  async promptUnlockVault() {
    const alert = await this.alertCtrl.create({
      header: '🔐 Super-Lock Modifica Parametri',
      subHeader: `Stagione selezionata: ${this.regoleStagione()}`,
      message:
        'Inserisci il Master PIN di sicurezza (default: 1000) per sbloccare la modifica dei parametri per 5 minuti.',
      inputs: [
        {
          name: 'pin',
          type: 'password',
          placeholder: 'Master PIN (es. 1000)',
        },
      ],
      buttons: [
        { text: 'Annulla', role: 'cancel' },
        {
          text: 'Sblocca Super-Lock',
          handler: async (data) => {
            const ok = await this.authService.unlockVault(data?.pin || '');
            if (ok) {
              const toast = await this.toastCtrl.create({
                message: '🔓 Super-Lock sbloccato per 5 minuti!',
                duration: 3000,
                color: 'success',
              });
              await toast.present();
            } else {
              const toast = await this.toastCtrl.create({
                message: '❌ Master PIN errato.',
                duration: 2500,
                color: 'danger',
              });
              await toast.present();
            }
          },
        },
      ],
    });
    await alert.present();
  }

  async lockVaultNow() {
    this.authService.lockVault();
    const toast = await this.toastCtrl.create({
      message: '🔒 Tornato in modalità Sola Visualizzazione (View Mode).',
      duration: 2000,
      color: 'medium',
    });
    await toast.present();
  }

  updateSandboxField(key: keyof SeasonEngineConfig, value: number) {
    if (!this.canEditSelectedSeason()) return;
    const sId = this.regoleStagione();
    this.draftBySeason.update((prev) => ({
      ...prev,
      [sId]: {
        ...(prev[sId] || {}),
        [key]: Number(value),
      },
    }));
  }

  resetSandboxDefaults() {
    const sId = this.regoleStagione();
    const def = getDefaultSeasonConfig(sId);
    this.draftBySeason.update((prev) => ({
      ...prev,
      [sId]: { ...def, isSeasonLocked: this.sandboxParams().isSeasonLocked },
    }));
  }

  async toggleSigilloStagione() {
    if (!this.isVaultUnlocked()) {
      await this.promptUnlockVault();
      return;
    }
    const cfg = this.sandboxParams();
    const newLockState = !cfg.isSeasonLocked;

    const alert = await this.alertCtrl.create({
      header: newLockState
        ? `🔒 Sigilla Stagione ${cfg.seasonId}`
        : `⚠️ Rimuovi Sigillo Storico ${cfg.seasonId}`,
      message: newLockState
        ? `Vuoi congelare e salvare su Firebase i parametri della stagione ${cfg.seasonId}? La classifica di questa stagione diventerà immutabile.`
        : `Attenzione: la stagione ${cfg.seasonId} è sigillata. Vuoi davvero sbloccarla per modificare i suoi parametri?`,
      buttons: [
        { text: 'Annulla', role: 'cancel' },
        {
          text: newLockState ? 'Sigilla e Salva' : 'Sblocca Stagione',
          handler: async () => {
            const updated: SeasonEngineConfig = {
              ...cfg,
              isSeasonLocked: newLockState,
            };
            await this.statsEngine.saveSeasonConfig(updated);
            this.draftBySeason.update((prev) => {
              const copy = { ...prev };
              delete copy[cfg.seasonId];
              return copy;
            });
            const toast = await this.toastCtrl.create({
              message: newLockState
                ? `🔒 Stagione ${cfg.seasonId} sigillata e salvata su Firebase!`
                : `🔓 Sigillo rimosso per la stagione ${cfg.seasonId}.`,
              duration: 2800,
              color: newLockState ? 'success' : 'warning',
            });
            await toast.present();
          },
        },
      ],
    });
    await alert.present();
  }

  async salvaConfigStagioneSuFirebase() {
    if (!this.isVaultUnlocked()) return;
    const cfg = this.sandboxParams();

    const alert = await this.alertCtrl.create({
      header: `☁️ Salva Regolamento ${cfg.seasonId}`,
      message: `Confermi il salvataggio su Firebase (stagioni/${cfg.docId})? Queste regole verranno applicate solo alle partite della stagione ${cfg.seasonId}, senza toccare le altre stagioni.`,
      buttons: [
        { text: 'Annulla', role: 'cancel' },
        {
          text: 'Salva su Firebase',
          handler: async () => {
            await this.statsEngine.saveSeasonConfig(cfg);
            this.draftBySeason.update((prev) => {
              const copy = { ...prev };
              delete copy[cfg.seasonId];
              return copy;
            });
            const toast = await this.toastCtrl.create({
              message: `✅ Parametri stagione ${cfg.seasonId} salvati su Firebase!`,
              duration: 3000,
              color: 'success',
            });
            await toast.present();
          },
        },
      ],
    });
    await alert.present();
  }

  /**
   * Avvia la procedura sicura di clonazione DB PROD -> DEV (disponibile SOLO in DEV MODE).
   * Richiede il Master PIN del Super-Lock se non è già sbloccato.
   */
  async promptSyncProdToDev() {
    if (!this.devDbSync.isDevMode || this.devDbSync.isSyncing()) {
      return;
    }

    const needsPin = !this.isVaultUnlocked();

    const alert = await this.alertCtrl.create({
      header: '🔄 Clona DB PROD in DEV',
      subHeader: 'calcettoabuffone-prod (Read-Only) → calcettoabuffone (DEV)',
      message: needsPin
        ? 'Questa operazione copierà in modo pulito giocatori, partite, stagioni e pagelle da PROD dentro DEV, rimuovendo i dati di test presenti solo in DEV. Inserisci il Master PIN (default: 1000) per confermare:'
        : 'Confermi di voler allineare il DB di DEV copiando tutti i dati aggiornati da PROD (e rimuovendo eventuali record di test creati solo in DEV)?',
      inputs: needsPin
        ? [
            {
              name: 'pin',
              type: 'password',
              placeholder: 'Master PIN (es. 1000)',
            },
          ]
        : [],
      buttons: [
        { text: 'Annulla', role: 'cancel' },
        {
          text: 'Avvia Copia Pulita',
          handler: async (data) => {
            if (needsPin) {
              const unlocked = await this.authService.unlockVault(
                data?.pin || ''
              );
              if (!unlocked) {
                const errToast = await this.toastCtrl.create({
                  message: '❌ Master PIN errato. Copia DB annullata.',
                  duration: 2600,
                  color: 'danger',
                });
                await errToast.present();
                return false;
              }
            }
            this.executeProdToDevSync();
            return true;
          },
        },
      ],
    });

    await alert.present();
  }

  private async executeProdToDevSync() {
    try {
      const report = await this.devDbSync.syncProdToDev();
      const toast = await this.toastCtrl.create({
        message: `✅ DB PROD copiato in DEV! (${report.giocatoriSynced} giocatori, ${report.partiteSynced} partite, ${report.orphansRemoved} record di test rimossi)`,
        duration: 4000,
        color: 'success',
        position: 'top',
      });
      await toast.present();
    } catch (err: any) {
      const toast = await this.toastCtrl.create({
        message: `❌ Errore sincronizzazione DB: ${err?.message || 'Errore sconosciuto'}`,
        duration: 4000,
        color: 'danger',
        position: 'top',
      });
      await toast.present();
    }
  }

  updateSimField(key: string, value: any) {
    this.simInput.update((prev) => ({
      ...prev,
      [key]:
        typeof prev[key as keyof typeof prev] === 'boolean'
          ? Boolean(value)
          : Number(value),
    }));
  }

  getEffectiveSeasonConfig(seasonId: string): SeasonEngineConfig {
    const base = this.statsEngine.getSeasonConfig(seasonId);
    const draft = this.draftBySeason()[seasonId];
    return draft ? { ...base, ...draft } : base;
  }

  // =========================================================================
  // CALCOLO TABELLA GATEKEEPER & STATISTICHE GLOBALI STAGIONE
  // =========================================================================
  seasonOverview = computed(() => {
    const stagione = this.stagioneSelezionata();
    const partite = (this.statsEngine.partiteRaw() || []).filter(
      (p: any) =>
        p.pagelleInserite === true ||
        p.matchConcluso === true ||
        p.status === 'conclusa',
    );
    const matchesInView =
      stagione === ALL_SEASONS
        ? partite
        : partite.filter((p) => getStagionePartita(p) === stagione);

    const totalMatches = matchesInView.length;
    const isAllTime = stagione === ALL_SEASONS;
    const minMatchesFenomeno = isAllTime
      ? 8
      : Math.min(5, Math.max(3, Math.ceil(totalMatches * 0.55)));
    const mmrThresholdFenomeno = isAllTime ? 1300 : 1275;
    const maxSlotsFenomeno = totalMatches >= 10 ? 2 : 1;

    return {
      stagione,
      isAllTime,
      totalMatches,
      minMatchesFenomeno,
      mmrThresholdFenomeno,
      maxSlotsFenomeno,
    };
  });

  // =========================================================================
  // RADIOGRAFIA GIOCATORI (USA I PARAMETRI DELLA STAGIONE DI OGNI PARTITA)
  // =========================================================================
  playersAuditList = computed<PlayerXRayAudit[]>(() => {
    const giocatori = this.statsEngine.giocatoriRaw() || [];
    const partite = this.statsEngine.partiteRaw() || [];
    const statsRes = this.statsEngine.statsResult();
    const stagione = this.stagioneSelezionata();
    const overview = this.seasonOverview();

    const partiteValide = partite
      .filter((p: any) => p.pagelleInserite === true)
      .sort((a: any, b: any) => {
        const dA = parseDate(a.dataPartita || a.dataOra)?.getTime() ?? 0;
        const dB = parseDate(b.dataPartita || b.dataOra)?.getTime() ?? 0;
        return dA - dB;
      });

    const partiteStagione =
      stagione === ALL_SEASONS
        ? partiteValide
        : partiteValide.filter((p) => getStagionePartita(p) === stagione);

    const mmrMap =
      stagione === ALL_SEASONS
        ? statsRes.allTime
        : statsRes.bySeason.get(stagione);

    const prevSeasonMap = statsRes.bySeason.get(PREVIOUS_SEASON);

    const rankedByMmr = Array.from(mmrMap?.values() || [])
      .filter((p) => p.partiteGiocate > 0)
      .sort((a, b) => b.currentMmr - a.currentMmr);

    const list: PlayerXRayAudit[] = giocatori.map((g) => {
      const pMmr = mmrMap?.get(g.id);
      const prevMmrObj = prevSeasonMap?.get(g.id);
      const chem = statsRes.chemistry.get(g.id);

      let partiteGiocate = 0;
      let wins = 0;
      let draws = 0;
      let losses = 0;
      let golTotali = 0;
      let autogolTotali = 0;
      let assistTotali = 0;
      let sommaVoti = 0;

      let puntiPresenzaTot = 0;
      let puntiVittorieTot = 0;
      let puntiPareggiTot = 0;
      let puntiGolTot = 0;
      let puntiAutogolTot = 0;
      let puntiAssistTot = 0;
      let puntiVotiTot = 0;

      const matchRows: PlayerMatchAuditRow[] = [];

      for (const p of partiteStagione) {
        const inA = p.teamA?.find((pl: any) => pl.id === g.id);
        const inB = p.teamB?.find((pl: any) => pl.id === g.id);
        if (!inA && !inB) continue;

        partiteGiocate++;
        const matchSeason = getStagionePartita(p);
        const mCfg = this.getEffectiveSeasonConfig(matchSeason);

        const team: 'A' | 'B' = inA ? 'A' : 'B';
        const playerObj = inA || inB;
        const scoreA = Number(p.scoreA) || 0;
        const scoreB = Number(p.scoreB) || 0;
        const won = (inA && scoreA > scoreB) || (inB && scoreB > scoreA);
        const draw = scoreA === scoreB;
        const result: 'W' | 'D' | 'L' = won ? 'W' : draw ? 'D' : 'L';

        if (won) wins++;
        else if (draw) draws++;
        else losses++;

        const eventi = p.eventiGol || [];
        const golFatti =
          eventi.filter(
            (eg: any) =>
              (eg.idAssegnato === g.id || eg.nome === g.nome) && !eg.isAutogoal,
          ).length ||
          Number(playerObj?.gol) ||
          0;
        const autogolFatti =
          eventi.filter(
            (eg: any) =>
              (eg.idAssegnato === g.id || eg.nome === g.nome) && eg.isAutogoal,
          ).length ||
          Number(playerObj?.autogol) ||
          0;
        const assistFatti =
          eventi.filter(
            (eg: any) =>
              eg.assistId === g.id ||
              (!eg.assistId && eg.assistNome && eg.assistNome === g.nome),
          ).length ||
          Number(playerObj?.assist) ||
          0;
        const voto = Number(playerObj?.voto) || 0;

        golTotali += golFatti;
        autogolTotali += autogolFatti;
        assistTotali += assistFatti;
        sommaVoti += voto;

        const puntiPresenza = mCfg.legacyPresenza;
        const puntiEsito = won
          ? mCfg.legacyVittoria
          : draw
            ? mCfg.legacyPareggio
            : mCfg.legacySconfitta;
        const puntiGol = golFatti * mCfg.legacyGol;
        const puntiAutogol = autogolFatti * mCfg.legacyAutogol;
        const puntiAssist = assistFatti * mCfg.legacyAssist;
        const puntiVoto = Math.round(voto * mCfg.legacyPesoVoto * 10) / 10;

        puntiPresenzaTot += puntiPresenza;
        if (won) puntiVittorieTot += puntiEsito;
        if (draw) puntiPareggiTot += puntiEsito;
        puntiGolTot += puntiGol;
        puntiAutogolTot += puntiAutogol;
        puntiAssistTot += puntiAssist;
        puntiVotiTot += puntiVoto;

        const legacyTotalMatch =
          Math.round(
            (puntiPresenza +
              puntiEsito +
              puntiGol +
              puntiAutogol +
              puntiAssist +
              puntiVoto) *
              10,
          ) / 10;

        const hist = pMmr?.history.find((h) => h.partitaId === p.id);

        let gkBonusVal = 0;
        if (p.rotazionePortieri) {
          const gkM = StatsEngineService.calculateGoalkeeperStatsForMatch(
            g.id,
            p,
            team,
          );
          if (gkM.turniGiocati > 0) {
            if (gkM.golSubiti === 0)
              gkBonusVal = Math.min(5, 2 + gkM.cleanSheetTurni);
            else if (gkM.golSubiti === 1) gkBonusVal = 0;
            else if (gkM.golSubiti === 2) gkBonusVal = -1;
            else if (gkM.golSubiti >= 3)
              gkBonusVal = Math.max(-5, -2 - (gkM.golSubiti - 2));
          }
        }

        matchRows.push({
          partitaId: p.id || '',
          data:
            p.dataPartita ||
            parseDate(p.dataOra)?.toLocaleDateString('it-IT') ||
            '—',
          stagione: matchSeason,
          team,
          result,
          scoreStr: `${scoreA}-${scoreB}`,
          mmrBefore: hist?.mmrBefore ?? BASE_INITIAL_MMR,
          teamAvgMmr: hist?.teamAvgMmrBefore ?? BASE_INITIAL_MMR,
          oppAvgMmr: hist?.opponentAvgMmrBefore ?? BASE_INITIAL_MMR,
          winProbPercent: hist
            ? Math.round(hist.winProbability * 1000) / 10
            : 50,
          baseTeamDelta: hist?.baseTeamDelta ?? 0,
          movBonus: hist?.individualBonus?.movBonus ?? 0,
          ratingBonus: hist?.individualBonus?.ratingBonus ?? 0,
          contributionBonus: hist?.individualBonus?.contributionBonus ?? 0,
          streakBonus: hist?.individualBonus?.streakBonus ?? 0,
          gkBonus: gkBonusVal,
          eliteBrake: hist?.individualBonus?.eliteBrakeApplied ?? 0,
          isPlacement: !!hist?.individualBonus?.placementMultiplierApplied,
          mmrDelta: hist?.delta ?? 0,
          mmrAfter: hist?.mmrAfter ?? BASE_INITIAL_MMR,
          voto,
          gol: golFatti,
          autogol: autogolFatti,
          assist: assistFatti,
          puntiPresenza,
          puntiEsito,
          puntiGol,
          puntiAutogol,
          puntiAssist,
          puntiVoto,
          legacyTotalMatch,
        });
      }

      puntiPresenzaTot = Math.round(puntiPresenzaTot * 10) / 10;
      puntiVittorieTot = Math.round(puntiVittorieTot * 10) / 10;
      puntiPareggiTot = Math.round(puntiPareggiTot * 10) / 10;
      puntiGolTot = Math.round(puntiGolTot * 10) / 10;
      puntiAutogolTot = Math.round(puntiAutogolTot * 10) / 10;
      puntiAssistTot = Math.round(puntiAssistTot * 10) / 10;
      puntiVotiTot = Math.round(puntiVotiTot * 10) / 10;

      const puntiLegacyTotali =
        Math.round(
          (puntiPresenzaTot +
            puntiVittorieTot +
            puntiPareggiTot +
            puntiGolTot +
            puntiAutogolTot +
            puntiAssistTot +
            puntiVotiTot) *
            10,
        ) / 10;

      const mediaVoto =
        partiteGiocate > 0
          ? Math.round((sommaVoti / partiteGiocate) * 100) / 100
          : 0;
      const winRate =
        partiteGiocate > 0
          ? Math.round((wins / partiteGiocate) * 1000) / 10
          : 0;

      const seasonStartMmr = pMmr?.seasonStartMmr ?? BASE_INITIAL_MMR;
      const prevSeasonFinalMmr =
        prevMmrObj && prevMmrObj.partiteGiocate > 0
          ? prevMmrObj.currentMmr
          : null;
      const softResetFormulaStr =
        stagione === ALL_SEASONS
          ? `Base All-Time = ${BASE_INITIAL_MMR}`
          : prevSeasonFinalMmr !== null
            ? `round(1000 + (${prevSeasonFinalMmr} - 1000) × ${SOFT_RESET_FACTOR}) = ${seasonStartMmr}`
            : `Nuovo nella stagione = ${BASE_INITIAL_MMR}`;

      const currentMmr =
        partiteGiocate > 0 && pMmr ? Math.round(pMmr.currentMmr) : seasonStartMmr;
      const peakMmr =
        partiteGiocate > 0 && pMmr ? Math.round(pMmr.peakMmr) : seasonStartMmr;
      const lowestMmr =
        partiteGiocate > 0 && pMmr ? Math.round(pMmr.lowestMmr) : seasonStartMmr;
      const netMmrGain = currentMmr - seasonStartMmr;
      const tier = partiteGiocate > 0 && pMmr ? pMmr.tier : UNRANKED_TIER;

      const rankIdx = rankedByMmr.findIndex((r) => r.giocatoreId === g.id);
      const rankMmr = rankIdx >= 0 ? rankIdx + 1 : 999;
      const mmrReq =
        rankMmr === 2 && overview.maxSlotsFenomeno >= 2
          ? 1300
          : overview.mmrThresholdFenomeno;
      const mmrOk = currentMmr >= mmrReq;
      const matchesOk = partiteGiocate >= overview.minMatchesFenomeno;
      const slotOk = rankMmr <= overview.maxSlotsFenomeno;

      const gkStats = StatsEngineService.calculateGoalkeeperStatsForPlayer(
        g.id,
        partiteStagione,
      );
      const gkFormulaStr =
        gkStats.minutiInPorta > 0
          ? `${gkStats.golSubiti} gol / (${gkStats.minutiInPorta} min / 50) = ${gkStats.mediaGolSubiti50m.toFixed(2)} gol/50m`
          : '0 minuti in porta registrati';

      const bestPartnerStr = chem?.bestPartner
        ? `${chem.bestPartner.partnerNome} (${chem.bestPartner.winRateTogether}% WR su ${chem.bestPartner.matchesTogether} gare)`
        : 'Nessuna coppia (>=2 gare)';
      const nemesisStr = chem?.biggestNemesis
        ? `${chem.biggestNemesis.opponentNome} (${chem.biggestNemesis.opponentWinRate}% sconfitte su ${chem.biggestNemesis.matchesAgainst} scontri)`
        : 'Nessuna nemesi (>=2 scontri)';

      return {
        id: g.id,
        nome: g.nome,
        soprannome: g.soprannome || g.soprannomeAi,
        fotoUrl: getAvatarUrl(g.fotoUrl),
        partiteGiocate,
        wins,
        draws,
        losses,
        winRate,
        puntiPresenzaTot,
        puntiVittorieTot,
        puntiPareggiTot,
        golTotali,
        puntiGolTot,
        autogolTotali,
        puntiAutogolTot,
        assistTotali,
        puntiAssistTot,
        sommaVoti: puntiVotiTot,
        mediaVoto,
        puntiLegacyTotali,
        seasonStartMmr,
        prevSeasonFinalMmr,
        softResetFormulaStr,
        currentMmr,
        peakMmr,
        lowestMmr,
        netMmrGain,
        tier,
        streak: pMmr?.form?.currentStreak ?? 0,
        formLabel: pMmr?.form?.statusLabel ?? 'Costante',
        fenomenoCheck: {
          mmrRequired: mmrReq,
          mmrOk,
          matchesRequired: overview.minMatchesFenomeno,
          matchesOk,
          rankMmr,
          maxSlots: overview.maxSlotsFenomeno,
          slotOk,
          isFenomeno: tier.id === 'fenomeno',
        },
        gk: {
          ...gkStats,
          formulaStr: gkFormulaStr,
        },
        bestPartnerStr,
        nemesisStr,
        matchRows: [...matchRows].reverse(),
      };
    });

    const q = this.searchPlayer().toLowerCase().trim();
    const filtered = q
      ? list.filter(
          (p) =>
            p.nome.toLowerCase().includes(q) ||
            (p.soprannome || '').toLowerCase().includes(q),
        )
      : list;

    return filtered.sort(
      (a, b) =>
        b.partiteGiocate - a.partiteGiocate ||
        b.puntiLegacyTotali - a.puntiLegacyTotali ||
        b.currentMmr - a.currentMmr,
    );
  });

  // =========================================================================
  // AUDIT LOG PARTITE (CON PARAMETRI DELLA STAGIONE DEL MATCH)
  // =========================================================================
  matchesAuditList = computed<MatchAuditSheet[]>(() => {
    const partite = this.statsEngine.partiteRaw() || [];
    const statsRes = this.statsEngine.statsResult();
    const stagione = this.stagioneSelezionata();

    const validMatches = partite
      .filter(
        (p: any) =>
          p.pagelleInserite === true ||
          p.matchConcluso === true ||
          p.status === 'conclusa',
      )
      .filter((p) =>
        stagione === ALL_SEASONS ? true : getStagionePartita(p) === stagione,
      )
      .sort((a: any, b: any) => {
        const dA = parseDate(a.dataPartita || a.dataOra)?.getTime() ?? 0;
        const dB = parseDate(b.dataPartita || b.dataOra)?.getTime() ?? 0;
        return dB - dA;
      });

    const mmrMap =
      stagione === ALL_SEASONS
        ? statsRes.allTime
        : statsRes.bySeason.get(stagione) || statsRes.allTime;

    return validMatches.map((m: any) => {
      const matchId = m.id || '';
      const matchSeason = getStagionePartita(m);
      const mCfg = this.getEffectiveSeasonConfig(matchSeason);
      const scoreA = Number(m.scoreA) || 0;
      const scoreB = Number(m.scoreB) || 0;
      const aWon = scoreA > scoreB;
      const bWon = scoreB > scoreA;
      const isDraw = scoreA === scoreB;
      const eventi = m.eventiGol || [];

      const buildRow = (pl: any, team: 'A' | 'B', won: boolean) => {
        const pStat = mmrMap.get(pl.id);
        const hist = pStat?.history.find((h) => h.partitaId === matchId);

        const gol =
          eventi.filter(
            (eg: any) =>
              (eg.idAssegnato === pl.id || eg.nome === pl.nome) && !eg.isAutogoal,
          ).length ||
          Number(pl.gol) ||
          0;
        const autogol =
          eventi.filter(
            (eg: any) =>
              (eg.idAssegnato === pl.id || eg.nome === pl.nome) && eg.isAutogoal,
          ).length ||
          Number(pl.autogol) ||
          0;
        const assist =
          eventi.filter(
            (eg: any) =>
              eg.assistId === pl.id ||
              (!eg.assistId && eg.assistNome && eg.assistNome === pl.nome),
          ).length ||
          Number(pl.assist) ||
          0;
        const voto = Number(pl.voto) || 0;

        let gkBonusVal = 0;
        if (m.rotazionePortieri) {
          const gkM = StatsEngineService.calculateGoalkeeperStatsForMatch(
            pl.id,
            m,
            team,
          );
          if (gkM.turniGiocati > 0) {
            if (gkM.golSubiti === 0)
              gkBonusVal = Math.min(5, 2 + gkM.cleanSheetTurni);
            else if (gkM.golSubiti === 1) gkBonusVal = 0;
            else if (gkM.golSubiti === 2) gkBonusVal = -1;
            else if (gkM.golSubiti >= 3)
              gkBonusVal = Math.max(-5, -2 - (gkM.golSubiti - 2));
          }
        }

        const puntiPresenza = mCfg.legacyPresenza;
        const puntiEsito = won
          ? mCfg.legacyVittoria
          : isDraw
            ? mCfg.legacyPareggio
            : mCfg.legacySconfitta;
        const puntiGol = gol * mCfg.legacyGol;
        const puntiAutogol = autogol * mCfg.legacyAutogol;
        const puntiAssist = assist * mCfg.legacyAssist;
        const puntiVoto = Math.round(voto * mCfg.legacyPesoVoto * 10) / 10;
        const legacyTotalMatch =
          Math.round(
            (puntiPresenza +
              puntiEsito +
              puntiGol +
              puntiAutogol +
              puntiAssist +
              puntiVoto) *
              10,
          ) / 10;

        return {
          playerId: pl.id,
          nome: pl.nome || pStat?.nome || 'Giocatore',
          fotoUrl: getAvatarUrl(pl.fotoUrl || pStat?.fotoUrl),
          partitaId: matchId,
          data: m.dataPartita || '',
          stagione: matchSeason,
          team,
          result: (won ? 'W' : isDraw ? 'D' : 'L') as 'W' | 'D' | 'L',
          scoreStr: `${scoreA}-${scoreB}`,
          mmrBefore: hist?.mmrBefore ?? BASE_INITIAL_MMR,
          teamAvgMmr: hist?.teamAvgMmrBefore ?? BASE_INITIAL_MMR,
          oppAvgMmr: hist?.opponentAvgMmrBefore ?? BASE_INITIAL_MMR,
          winProbPercent: hist
            ? Math.round(hist.winProbability * 1000) / 10
            : 50,
          baseTeamDelta: hist?.baseTeamDelta ?? 0,
          movBonus: hist?.individualBonus?.movBonus ?? 0,
          ratingBonus: hist?.individualBonus?.ratingBonus ?? 0,
          contributionBonus: hist?.individualBonus?.contributionBonus ?? 0,
          streakBonus: hist?.individualBonus?.streakBonus ?? 0,
          gkBonus: gkBonusVal,
          eliteBrake: hist?.individualBonus?.eliteBrakeApplied ?? 0,
          isPlacement: !!hist?.individualBonus?.placementMultiplierApplied,
          mmrDelta: hist?.delta ?? 0,
          mmrAfter: hist?.mmrAfter ?? BASE_INITIAL_MMR,
          voto,
          gol,
          autogol,
          assist,
          puntiPresenza,
          puntiEsito,
          puntiGol,
          puntiAutogol,
          puntiAssist,
          puntiVoto,
          legacyTotalMatch,
        };
      };

      const rowsA = (m.teamA || []).map((pl: any) => buildRow(pl, 'A', aWon));
      const rowsB = (m.teamB || []).map((pl: any) => buildRow(pl, 'B', bWon));

      const avgMmrA = rowsA[0]?.teamAvgMmr ?? BASE_INITIAL_MMR;
      const avgMmrB = rowsB[0]?.teamAvgMmr ?? BASE_INITIAL_MMR;
      const odds = StatsEngineService.calculateOdds(avgMmrA, avgMmrB);

      const goalDiffA = scoreA - scoreB;
      const signA = goalDiffA > 0 ? 1 : goalDiffA < 0 ? -1 : 0;
      const movBonusA =
        signA * Math.min(5, Math.round(Math.log2(Math.abs(goalDiffA) + 1) * 2));

      const actualA = aWon ? 1 : isDraw ? 0.5 : 0;
      const actualB = bWon ? 1 : isDraw ? 0.5 : 0;
      const baseDeltaA =
        Math.round(mCfg.kFactor * (actualA - odds.probA) * 10) / 10;
      const baseDeltaB =
        Math.round(mCfg.kFactor * (actualB - odds.probB) * 10) / 10;

      return {
        id: matchId,
        data:
          m.dataPartita ||
          parseDate(m.dataOra)?.toLocaleDateString('it-IT') ||
          '—',
        luogo: m.luogo || 'Campo Calcetto',
        stagione: matchSeason,
        scoreA,
        scoreB,
        avgMmrA,
        avgMmrB,
        probAPercent: odds.probAPercent,
        probBPercent: odds.probBPercent,
        baseDeltaA,
        baseDeltaB,
        movBonusA,
        movBonusB: -movBonusA,
        rowsA,
        rowsB,
      };
    });
  });

  // =========================================================================
  // CALCOLATORE LIVE SIMULATORE "WHAT-IF"
  // =========================================================================
  simResult = computed(() => {
    const s = this.simInput();
    const sb = this.sandboxParams();

    const probA = 1 / (1 + Math.pow(10, (s.oppAvgMmr - s.teamAvgMmr) / 400));
    const probAPercent = Math.round(probA * 1000) / 10;

    const won = s.teamScore > s.oppScore;
    const draw = s.teamScore === s.oppScore;
    const actualScore = won ? 1 : draw ? 0.5 : 0;
    const baseTeamDelta =
      Math.round(sb.kFactor * (actualScore - probA) * 100) / 100;

    const goalDiff = s.teamScore - s.oppScore;
    const sign = goalDiff > 0 ? 1 : goalDiff < 0 ? -1 : 0;
    const movBonus =
      sign * Math.min(5, Math.round(Math.log2(Math.abs(goalDiff) + 1) * 2));

    const ratingBonus =
      s.voto > 0
        ? Math.max(
            -8,
            Math.min(
              10,
              Math.round((s.voto - sb.votoNeutro) * sb.votoMoltiplicatore),
            ),
          )
        : 0;

    const netGoals = Math.max(0, s.gol - s.autogol);
    const contributionBonus = Math.min(
      4,
      Math.floor(netGoals * sb.pesoGolMmr + s.assist * sb.pesoAssistMmr),
    );

    let prospectiveStreak = 0;
    let streakBonus = 0;
    if (won) {
      prospectiveStreak = s.streakBefore >= 0 ? s.streakBefore + 1 : 1;
      if (prospectiveStreak === 3) streakBonus = 4;
      else if (prospectiveStreak === 4) streakBonus = 6;
      else if (prospectiveStreak >= 5) streakBonus = 8;
    } else if (!won && !draw) {
      prospectiveStreak = s.streakBefore <= 0 ? s.streakBefore - 1 : -1;
      if (prospectiveStreak === -3) streakBonus = -4;
      else if (prospectiveStreak === -4) streakBonus = -6;
      else if (prospectiveStreak <= -5) streakBonus = -8;
    }

    let gkBonus = 0;
    if (s.gkTurni > 0) {
      if (s.gkGolSubiti === 0) {
        gkBonus = Math.min(5, 2 + s.gkCleanSheetTurni);
      } else if (s.gkGolSubiti === 1) {
        gkBonus = 0;
      } else if (s.gkGolSubiti === 2) {
        gkBonus = -1;
      } else if (s.gkGolSubiti >= 3) {
        gkBonus = Math.max(-5, -2 - (s.gkGolSubiti - 2));
      }
    }

    const preEliteRaw =
      baseTeamDelta +
      movBonus +
      ratingBonus +
      contributionBonus +
      streakBonus +
      gkBonus;

    let postEliteRaw = preEliteRaw;
    let eliteBrake = 0;
    if (s.playerMmrBefore >= 1200 && preEliteRaw > 0) {
      postEliteRaw = Math.round(preEliteRaw * 0.75);
      eliteBrake = Math.round((postEliteRaw - preEliteRaw) * 10) / 10;
    } else if (s.playerMmrBefore >= 1250 && preEliteRaw < 0) {
      postEliteRaw = Math.round(preEliteRaw * 1.15);
      eliteBrake = Math.round((postEliteRaw - preEliteRaw) * 10) / 10;
    }

    let finalMmrDelta = 0;
    if (s.isPlacement) {
      const amp = Math.round(postEliteRaw * sb.placementMultiplier);
      finalMmrDelta = Math.max(
        PLACEMENT_CLAMP_MIN,
        Math.min(PLACEMENT_CLAMP_MAX, amp),
      );
    } else {
      finalMmrDelta = Math.max(
        sb.hardClampMin,
        Math.min(sb.hardClampMax, Math.round(postEliteRaw)),
      );
    }

    const mmrAfter = Math.max(100, s.playerMmrBefore + finalMmrDelta);

    const legacyPresenza = sb.legacyPresenza;
    const legacyEsito = won
      ? sb.legacyVittoria
      : draw
        ? sb.legacyPareggio
        : sb.legacySconfitta;
    const legacyGol = s.gol * sb.legacyGol;
    const legacyAutogol = s.autogol * sb.legacyAutogol;
    const legacyAssist = s.assist * sb.legacyAssist;
    const legacyVoto = Math.round(s.voto * sb.legacyPesoVoto * 10) / 10;
    const legacyTotal =
      Math.round(
        (legacyPresenza +
          legacyEsito +
          legacyGol +
          legacyAutogol +
          legacyAssist +
          legacyVoto) *
          10,
      ) / 10;

    return {
      probAPercent,
      actualScore,
      baseTeamDelta,
      movBonus,
      ratingBonus,
      contributionBonus,
      prospectiveStreak,
      streakBonus,
      gkBonus,
      preEliteRaw: Math.round(preEliteRaw * 10) / 10,
      eliteBrake,
      finalMmrDelta,
      mmrAfter,
      legacyPresenza,
      legacyEsito,
      legacyGol,
      legacyAutogol,
      legacyAssist,
      legacyVoto,
      legacyTotal,
    };
  });

  tornaAllaClassifica() {
    this.router.navigate(['/classifica']);
  }
}
