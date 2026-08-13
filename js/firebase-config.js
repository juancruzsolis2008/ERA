// ============ Configuración de Firebase + Cloudinary ============
  export var firebaseConfig = {
    apiKey: "AIzaSyD1yEsOTnUVy-XPx7tng7La4lqSiRO1Dw8",
    authDomain: "panel-para-entrenadores.firebaseapp.com",
    projectId: "panel-para-entrenadores",
    storageBucket: "panel-para-entrenadores.firebasestorage.app",
    messagingSenderId: "700316008647",
    appId: "1:700316008647:web:6867dd58244aaeebc1fee2"
  };

  export var fbBootError = null;
  try{
    firebase.initializeApp(firebaseConfig);
  }catch(e){ fbBootError = e; }
  export var auth = firebase.auth();
  export var db = firebase.firestore();

  export var CLOUDINARY_CLOUD_NAME = 'pms7wtlk';
  export var CLOUDINARY_UPLOAD_PRESET = 'fotos panel de entrenadores';
