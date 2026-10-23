import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';

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

async function checkProject(name, config) {
  console.log(`\n--- Controllo Progetto: ${name} (${config.projectId}) ---`);
  try {
    const app = initializeApp(config, name);
    const db = getFirestore(app);
    const snap = await getDocs(collection(db, 'giocatori'));
    console.log(`Giocatori trovati: ${snap.docs.length}`);

    let withPhoto = 0;
    for (const d of snap.docs) {
      const data = d.data();
      if (data.fotoUrl && typeof data.fotoUrl === 'string' && data.fotoUrl.startsWith('http') && !data.fotoUrl.includes('ionicframework.com')) {
        withPhoto++;
        console.log(` - [${d.id}] ${data.nome}: fotoUrl = ${data.fotoUrl}`);
      }
    }
    console.log(`Totale giocatori con foto reale su Storage: ${withPhoto} / ${snap.docs.length}`);
    return { name, count: snap.docs.length, withPhoto };
  } catch (err) {
    console.error(`Errore nel progetto ${name}:`, err.message);
    return { name, error: err.message };
  }
}

async function main() {
  await checkProject('DEV (calcettoabuffone)', devConfig);
  await checkProject('PROD (calcettoabuffone-prod)', prodConfig);
}

main();
