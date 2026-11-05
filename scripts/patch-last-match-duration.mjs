/**
 * Data Patch: Correzione durata ultima partita su Firestore
 *
 * Esecuzione:
 *   node scripts/patch-last-match-duration.mjs [--project=dev|prod|all] [--apply]
 *
 * Senza --apply esegue una dry-run (sola lettura e calcolo).
 * Con --apply applica l'aggiornamento su Firestore.
 */

import { initializeApp } from 'firebase/app';
import {
  getFirestore,
  collection,
  query,
  orderBy,
  limit,
  getDocs,
  doc,
  updateDoc,
  Timestamp,
} from 'firebase/firestore';

const devConfig = {
  apiKey: 'AIzaSyCqnjBXeJoJ7ZfUTLMYyAMBNhBZiazA7mA',
  authDomain: 'calcettoabuffone.firebaseapp.com',
  projectId: 'calcettoabuffone',
  storageBucket: 'calcettoabuffone.firebasestorage.app',
  messagingSenderId: '1048869516820',
  appId: '1:1048869516820:web:02ca970bf5fafd47f79901',
};

const prodConfig = {
  apiKey: 'AIzaSyCgcwLuNlknT3WuwUhwQg9VXskSdWQ4pjo',
  authDomain: 'calcettoabuffone-prod.firebaseapp.com',
  projectId: 'calcettoabuffone-prod',
  storageBucket: 'calcettoabuffone-prod.firebasestorage.app',
  messagingSenderId: '188767969527',
  appId: '1:188767969527:web:ddc554fbbef460e37f73f2',
};

const args = process.argv.slice(2);
const shouldApply = args.includes('--apply');
const targetProject = args.find((a) => a.startsWith('--project='))?.split('=')[1] || 'all';

async function calculateAverageDuration(db, excludeDocId) {
  const matchesQuery = query(collection(db, 'partite'), orderBy('dataOra', 'desc'), limit(25));
  const snap = await getDocs(matchesQuery);

  const validDurations = [];
  snap.docs.forEach((d) => {
    if (d.id === excludeDocId) return;
    const m = d.data();
    // Consideriamo partite concluse con durata credibile (> 30 min / 1800 sec)
    if (m.matchConcluso && typeof m.cronometro === 'number' && m.cronometro > 1800) {
      validDurations.push({
        id: d.id,
        data: m.dataPartita,
        luogo: m.luogo,
        sec: m.cronometro,
      });
    }
  });

  if (validDurations.length === 0) {
    return { avgSec: 3300, avgMin: 55, count: 0 }; // Default calcetto: 55 min
  }

  const sum = validDurations.reduce((acc, curr) => acc + curr.sec, 0);
  const avgSec = Math.round(sum / validDurations.length);
  const avgMin = Math.round(avgSec / 60);

  return { avgSec, avgMin, count: validDurations.length, samples: validDurations };
}

async function patchProject(envName, config) {
  console.log(`\n======================================================`);
  console.log(`🔎 Avvio Data-Patch su: ${envName} (${config.projectId})`);
  console.log(`Modalità: ${shouldApply ? '🚀 SCRITTURA (--apply)' : '👀 DRY-RUN (simulazione)'}`);
  console.log(`======================================================`);

  const app = initializeApp(config, envName + '_' + Date.now());
  const db = getFirestore(app);

  // 1. Recupero ultimo documento partita registrata
  const lastMatchQuery = query(collection(db, 'partite'), orderBy('dataOra', 'desc'), limit(1));
  const snap = await getDocs(lastMatchQuery);

  if (snap.empty) {
    console.warn(`⚠️ Nessuna partita trovata in ${envName}.`);
    return;
  }

  const lastDoc = snap.docs[0];
  const lastData = lastDoc.data();
  const oldDurationSec = lastData.cronometro || lastData.accumulatedTime || 0;
  const oldDurationMin = Math.round(oldDurationSec / 60);

  console.log(`\n📌 Ultima Partita Identificata:`);
  console.log(`   - Document ID : ${lastDoc.id}`);
  console.log(`   - Data e Ora  : ${lastData.dataPartita} alle ore ${lastData.orario}`);
  console.log(`   - Luogo       : ${lastData.luogo}`);
  console.log(`   - Risultato   : ${lastData.scoreA} - ${lastData.scoreB}`);
  console.log(`   - Stato       : ${lastData.status} (matchConcluso: ${lastData.matchConcluso})`);
  console.log(`   - Durata prec.: ${oldDurationSec}s (${oldDurationMin} min)`);

  let newDurationSec = 0;
  let methodUsed = '';
  let startedAt = lastData.startedAt || null;
  let endedAt = lastData.endedAt || lastData.finishedAt || null;

  // 2. Opzione Primaria: Verifica Audit Trail Timestamp (startedAt & finishedAt/endedAt)
  const hasAbsoluteTimestamps =
    typeof startedAt === 'number' &&
    typeof endedAt === 'number' &&
    endedAt > startedAt &&
    endedAt - startedAt > 10 * 60 * 1000;

  if (hasAbsoluteTimestamps) {
    const diffMs = endedAt - startedAt;
    newDurationSec = Math.round(diffMs / 1000);
    const minuti = Math.round(diffMs / (1000 * 60));
    methodUsed = `Delta Timestamp Primario (endedAt - startedAt: ${minuti} minuti effettivi)`;
  } else {
    // 3. Opzione Secondaria: Fallback su Media delle ultime 10-20 partite valide
    const avgInfo = await calculateAverageDuration(db, lastDoc.id);
    newDurationSec = avgInfo.avgSec;
    const minuti = avgInfo.avgMin;
    methodUsed = `Fallback Media Storica (${avgInfo.count} partite analizzate -> media: ${avgInfo.avgMin} min / ${avgInfo.avgSec}s)`;

    // Se mancano i timestamp assoluti, calcoliamo l'inizio reale (es. dataPartita + orario programmato + 5 min per inizio riscaldamento/fischio)
    let baseTimeMs;
    if (lastData.dataPartita && lastData.orario) {
      const matchIso = `${lastData.dataPartita}T${lastData.orario}:00+01:00`;
      const parsedMatchDate = new Date(matchIso);
      if (!isNaN(parsedMatchDate.getTime())) {
        // Kickoff reale tipicamente 5 minuti dopo l'orario convocazione
        baseTimeMs = parsedMatchDate.getTime() + 5 * 60 * 1000;
      }
    }
    if (!baseTimeMs) {
      baseTimeMs = lastData.dataOra?.toMillis
        ? lastData.dataOra.toMillis()
        : lastData.dataOra?.seconds
          ? lastData.dataOra.seconds * 1000
          : Date.now();
    }
    startedAt = baseTimeMs;
    endedAt = baseTimeMs + (newDurationSec * 1000);
  }

  const orarioInizioStr = new Intl.DateTimeFormat('it-IT', {
    timeZone: 'Europe/Rome',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(startedAt));

  const orarioFineStr = new Intl.DateTimeFormat('it-IT', {
    timeZone: 'Europe/Rome',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(endedAt));

  const newDurationMin = Math.round(newDurationSec / 60);

  console.log(`\n📊 Ricalcolo Durata & Orari Effettivi:`);
  console.log(`   - Metodo utilizzato : ${methodUsed}`);
  console.log(`   - Vecchio Minutaggio: ${oldDurationSec} sec (~${oldDurationMin} min)`);
  console.log(`   - Nuovo Minutaggio  : ${newDurationSec} sec (~${newDurationMin} min)`);
  console.log(`   - Fischio Inizio    : ${orarioInizioStr} (ms: ${startedAt})`);
  console.log(`   - Fischio Finale    : ${orarioFineStr} (ms: ${endedAt})`);

  if (!shouldApply) {
    console.log(`\n💡 Dry-run completata. Per applicare le modifiche su Firestore riesegui con:`);
    console.log(`   node scripts/patch-last-match-duration.mjs --apply`);
    return;
  }

  // 4. Aggiornamento su Firestore
  console.log(`\n⚡ Applicazione patch in corso su Firestore...`);
  const docRef = doc(db, 'partite', lastDoc.id);
  await updateDoc(docRef, {
    cronometro: newDurationSec,
    accumulatedTime: newDurationSec,
    startedAt: startedAt,
    endedAt: endedAt,
    inizioPartita: Timestamp.fromMillis(startedAt),
    finePartita: Timestamp.fromMillis(endedAt),
    orarioInizioReale: orarioInizioStr,
    orarioFineReale: orarioFineStr,
    isTimerRunning: false,
    timerStartAt: null,
  });

  console.log(`✅ Documento [${lastDoc.id}] aggiornato con successo su ${envName}!`);
}

async function main() {
  if (targetProject === 'dev' || targetProject === 'all') {
    await patchProject('DEV', devConfig);
  }
  if (targetProject === 'prod' || targetProject === 'all') {
    await patchProject('PROD', prodConfig);
  }
}

main().catch((err) => {
  console.error('❌ Errore durante esecuzione patch:', err);
  process.exit(1);
});

