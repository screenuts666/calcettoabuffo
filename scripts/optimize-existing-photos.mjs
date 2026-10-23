import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, updateDoc } from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import sharp from 'sharp';

const configs = {
  dev: {
    name: 'DEV (calcettoabuffone)',
    apiKey: 'AIzaSyCqnjBXeJoJ7ZfUTLMYyAMBNhBZiazA7mA',
    authDomain: 'calcettoabuffone.firebaseapp.com',
    projectId: 'calcettoabuffone',
    storageBucket: 'calcettoabuffone.firebasestorage.app',
    messagingSenderId: '1048869516820',
    appId: '1:1048869516820:web:02ca970bf5fafd47f79901',
  },
  prod: {
    name: 'PROD (calcettoabuffone-prod)',
    apiKey: 'AIzaSyCgcwLuNlknT3WuwUhwQg9VXskSdWQ4pjo',
    authDomain: 'calcettoabuffone-prod.firebaseapp.com',
    projectId: 'calcettoabuffone-prod',
    storageBucket: 'calcettoabuffone-prod.firebasestorage.app',
    messagingSenderId: '188767969527',
    appId: '1:188767969527:web:ddc554fbbef460e37f73f2',
  },
};

async function optimizeProject(envKey) {
  const cfg = configs[envKey];
  if (!cfg) throw new Error(`Ambiente sconosciuto: ${envKey}`);

  console.log(`\n========================================================`);
  console.log(`🚀 INIZIO OTTIMIZZAZIONE FOTO: ${cfg.name}`);
  console.log(`========================================================\n`);

  const app = initializeApp(cfg, `optimize-${envKey}`);
  const db = getFirestore(app);
  const storage = getStorage(app);

  const snap = await getDocs(collection(db, 'giocatori'));
  console.log(`Totale giocatori trovati nel database: ${snap.docs.length}\n`);

  let totalOriginalBytes = 0;
  let totalOptimizedBytes = 0;
  let optimizedCount = 0;
  let cleanedPlaceholdersCount = 0;
  let skippedAlreadyOptimized = 0;

  for (const playerDoc of snap.docs) {
    const p = playerDoc.data();
    const docId = playerDoc.id;
    const nome = p.nome || 'Senza nome';
    const fotoUrl = p.fotoUrl;

    if (!fotoUrl || typeof fotoUrl !== 'string') {
      continue;
    }

    // 1. Pulisci placeholder obsoleti di Ionic (che davano 403 Forbidden)
    if (fotoUrl.includes('ionicframework.com') || fotoUrl.includes('default-avatar.svg')) {
      await updateDoc(doc(db, `giocatori/${docId}`), { fotoUrl: '' });
      console.log(`🧹 [${nome}]: Rimosso URL obsoleto Ionic -> impostato fallback locale SVG`);
      cleanedPlaceholdersCount++;
      continue;
    }

    // 2. Se è una foto su Firebase Storage, analizziamo e ottimizziamo
    if (fotoUrl.startsWith('http') && fotoUrl.includes('firebasestorage.googleapis.com')) {
      try {
        console.log(`⏳ [${nome}]: Download foto originale...`);
        const res = await fetch(fotoUrl);
        if (!res.ok) {
          console.warn(`⚠️ [${nome}]: Impossibile scaricare (HTTP ${res.status}). Salto.`);
          continue;
        }

        const originalBuffer = Buffer.from(await res.arrayBuffer());
        const origSizeKB = originalBuffer.length / 1024;
        const origSizeMB = origSizeKB / 1024;

        // Se è già inferiore a 70KB e ha dimensione avatar quadrata, è già super-ottimizzata
        if (originalBuffer.length < 70 * 1024 && fotoUrl.includes('_optimized.jpg')) {
          console.log(`⏩ [${nome}]: Già ottimizzata (${origSizeKB.toFixed(1)} KB). Salto.`);
          skippedAlreadyOptimized++;
          continue;
        }

        const meta = await sharp(originalBuffer).metadata();
        console.log(`   Dimensioni originali: ${meta.width}x${meta.height} px | Peso: ${origSizeMB.toFixed(2)} MB (${origSizeKB.toFixed(1)} KB)`);

        // Ritaglio quadrato centrato + resize a 384x384 + JPEG ultra compresso con mozjpeg
        const optimizedBuffer = await sharp(originalBuffer)
          .rotate() // orienta correttamente secondo EXIF
          .resize(384, 384, {
            fit: 'cover',
            position: 'center',
          })
          .jpeg({
            quality: 82,
            mozjpeg: true,
          })
          .toBuffer();

        const optSizeKB = optimizedBuffer.length / 1024;
        const savingsPercent = ((1 - optimizedBuffer.length / originalBuffer.length) * 100).toFixed(1);

        // Upload in Firebase Storage con path pulito e standardizzato
        const storagePath = `avatars/${docId}_optimized.jpg`;
        const storageRef = ref(storage, storagePath);

        await uploadBytes(storageRef, optimizedBuffer, {
          contentType: 'image/jpeg',
          cacheControl: 'public, max-age=31536000',
        });

        const newDownloadUrl = await getDownloadURL(storageRef);

        // Aggiorna il documento in Firestore
        await updateDoc(doc(db, `giocatori/${docId}`), {
          fotoUrl: newDownloadUrl,
        });

        console.log(`   ✅ Ottimizzato: ${optSizeKB.toFixed(1)} KB (Risparmio: -${savingsPercent}%)`);
        console.log(`   🔗 Nuovo URL salvato in Firestore!\n`);

        totalOriginalBytes += originalBuffer.length;
        totalOptimizedBytes += optimizedBuffer.length;
        optimizedCount++;
      } catch (err) {
        console.error(`❌ Errore durante l'ottimizzazione di [${nome}]:`, err.message);
      }
    }
  }

  const savedMB = ((totalOriginalBytes - totalOptimizedBytes) / (1024 * 1024)).toFixed(2);
  const origMB = (totalOriginalBytes / (1024 * 1024)).toFixed(2);
  const finalMB = (totalOptimizedBytes / (1024 * 1024)).toFixed(2);

  console.log(`\n========================================================`);
  console.log(`🎉 RIEPILOGO OTTIMIZZAZIONE [${cfg.name}]:`);
  console.log(` - Foto elaborate e compresse: ${optimizedCount}`);
  console.log(` - Placeholder obsoleti puliti: ${cleanedPlaceholdersCount}`);
  console.log(` - Già ottimizzate saltate: ${skippedAlreadyOptimized}`);
  console.log(` - Peso totale prima: ${origMB} MB`);
  console.log(` - Peso totale dopo: ${finalMB} MB`);
  console.log(` - Spazio e banda risparmiati: ${savedMB} MB (-${totalOriginalBytes > 0 ? ((1 - totalOptimizedBytes / totalOriginalBytes) * 100).toFixed(1) : 0}%)`);
  console.log(`========================================================\n`);
}

async function main() {
  const target = process.argv[2] || 'all';

  if (target === 'prod' || target === 'all') {
    await optimizeProject('prod');
  }
  if (target === 'dev' || target === 'all') {
    await optimizeProject('dev');
  }

  console.log('🏁 Processo terminato con successo per tutti i target richiesti!');
}

main().catch(console.error);
