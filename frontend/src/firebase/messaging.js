import { getApps, initializeApp } from "firebase/app";
import {
  getMessaging,
  isSupported,
  onMessage,
  onRegistered,
  register,
} from "firebase/messaging";

const firebaseConfig = {
  apiKey: "AIzaSyD0cyOK0rZt4RnGYfWHofIaNi7rEjom4hs",
  authDomain: "aivle25.firebaseapp.com",
  projectId: "aivle25",
  storageBucket: "aivle25.firebasestorage.app",
  messagingSenderId: "191445593991",
  appId: "1:191445593991:web:5c5aae907bcc3eaaaaad22",
};

const vapidKey = "BMYMKNl3qJlViWMFQuYHZEBjJfB9vu6ndDPfuOlLYd-ITL8611vv812D_8nGq_qZvJ-Z3o7vYWcYFdcV4WuRc4k";
const serviceWorkerPath = "/firebase-messaging-sw.js";

let browserMessaging;

async function getBrowserMessaging() {
  if (!("Notification" in window) || !("serviceWorker" in navigator)) {
    throw new Error("이 브라우저는 푸시 알림을 지원하지 않습니다.");
  }
  if (!(await isSupported())) {
    throw new Error("현재 브라우저에서는 Firebase 푸시 알림을 사용할 수 없습니다.");
  }
  if (!browserMessaging) {
    browserMessaging = navigator.serviceWorker.register(serviceWorkerPath).then(registration => {
      const app = getApps()[0] || initializeApp(firebaseConfig);
      return { messaging: getMessaging(app), registration };
    });
  }
  return browserMessaging;
}

export async function requestFirebaseNotificationFid() {
  const permission = Notification.permission === "granted"
    ? "granted"
    : await Notification.requestPermission();

  if (permission !== "granted") {
    throw new Error("브라우저 알림 권한을 허용해야 푸시 알림을 받을 수 있습니다.");
  }

  const { messaging, registration } = await getBrowserMessaging();
  return new Promise((resolve, reject) => {
    let unsubscribe = () => {};
    const timeout = window.setTimeout(() => {
      unsubscribe();
      reject(new Error("FCM 설치 ID를 발급하지 못했습니다. 잠시 후 다시 시도해 주세요."));
    }, 10000);
    unsubscribe = onRegistered(messaging, fid => {
      window.clearTimeout(timeout);
      unsubscribe();
      resolve(fid);
    });
    register(messaging, {
      vapidKey,
      serviceWorkerRegistration: registration,
    }).catch(error => {
      window.clearTimeout(timeout);
      unsubscribe();
      reject(error);
    });
  });
}

export async function listenForForegroundMessages(callback) {
  const { messaging } = await getBrowserMessaging();
  return onMessage(messaging, callback);
}
