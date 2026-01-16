// Firebase Configuration
// Transcribed from your screenshot
const firebaseConfig = {
    apiKey: "AIzaSyDUtBThdYwBBQXhA_VkfNP9Lac1hhHI_g4",
    authDomain: "real-estate-dashboard-5d6bd.firebaseapp.com",
    projectId: "real-estate-dashboard-5d6bd",
    storageBucket: "real-estate-dashboard-5d6bd.firebasestorage.app",
    messagingSenderId: "488767202601",
    appId: "1:488767202601:web:0a5311616b113668178338",
    measurementId: "G-Z6RGHDYC5X"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();
