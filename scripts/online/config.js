/* Configuración del proyecto Firebase (consola → Configuración del proyecto → Tus apps).
 * No es secreta: lo que protege los datos son las reglas de firestore.rules. */
export const firebaseConfig = {
    apiKey: "AIzaSyA0MhHUGU1p2XL5fQyu6cOB4NXV4xwYovw",
    authDomain: "fichasao.firebaseapp.com",
    projectId: "fichasao",
    storageBucket: "fichasao.firebasestorage.app",
    messagingSenderId: "81599833563",
    appId: "1:81599833563:web:8d30bb1a81422ceab8b3fe"
};

/* Versión del SDK modular que se carga desde el CDN de Google (sin npm ni bundler) */
export const VERSION_SDK_FIREBASE = "10.12.2";
