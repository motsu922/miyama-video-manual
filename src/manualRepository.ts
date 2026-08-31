import {
  collection,
  deleteDoc,
  doc,
  addDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore'
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage'
import { signInAnonymously } from 'firebase/auth'
import { auth, db, isFirebaseConfigured, storage } from './firebase'
import type { FlashTestResult, InspectionImageKind, Manual } from './types'

const collectionName = 'videoManuals'

export function subscribeManuals(
  onManuals: (manuals: Manual[]) => void,
  onError: (message: string) => void,
) {
  if (!isFirebaseConfigured || !db) {
    onError('Firebase設定が未投入のためサンプルデータで表示しています')
    return () => undefined
  }

  const manualsQuery = query(collection(db, collectionName), orderBy('updatedAt', 'desc'))

  return onSnapshot(
    manualsQuery,
    (snapshot) => {
      const manuals = snapshot.docs.map((manualDoc) => ({
        id: manualDoc.id,
        ...manualDoc.data(),
      })) as Manual[]
      onManuals(manuals)
    },
    (error) => {
      onError(`Firestoreを参照できません: ${error.message}`)
    },
  )
}

export async function saveManual(manual: Manual) {
  if (!isFirebaseConfigured || !db) {
    throw new Error('Firebase設定が未投入です')
  }

  await ensureSignedIn()

  await setDoc(
    doc(db, collectionName, manual.id),
    {
      ...manual,
      updatedAt: new Date().toISOString().slice(0, 10),
      touchedAt: serverTimestamp(),
    },
    { merge: true },
  )
}

export async function deleteManual(manualId: string) {
  if (!isFirebaseConfigured || !db) {
    throw new Error('Firebase configuration is not available')
  }

  await ensureSignedIn()
  await deleteDoc(doc(db, collectionName, manualId))
}

export async function recordManualView(manual: Manual, viewer: string) {
  if (!isFirebaseConfigured || !db) {
    throw new Error('Firebase configuration is not available')
  }

  await ensureSignedIn()
  await addDoc(collection(db, 'viewLogs'), {
    manualId: manual.id,
    manualTitle: manual.title,
    version: manual.version,
    viewer,
    completedAt: new Date().toISOString(),
    createdAt: serverTimestamp(),
  })
}

export function subscribeFlashTestResults(
  manualId: string,
  onResults: (results: FlashTestResult[]) => void,
  onError: (message: string) => void,
) {
  if (!isFirebaseConfigured || !db) {
    onResults([])
    return () => undefined
  }

  const resultsQuery = query(
    collection(db, 'flashTestResults'),
    where('manualId', '==', manualId),
  )

  return onSnapshot(
    resultsQuery,
    (snapshot) => {
      onResults(
        snapshot.docs.map((resultDoc) => ({
          id: resultDoc.id,
          ...resultDoc.data(),
        })) as FlashTestResult[],
      )
    },
    (error) => onError(`フラッシュテスト結果を取得できません: ${error.message}`),
  )
}

export async function recordFlashTestResult(result: Omit<FlashTestResult, 'id'>) {
  if (!isFirebaseConfigured || !db) {
    throw new Error('Firebase configuration is not available')
  }

  await ensureSignedIn()
  await addDoc(collection(db, 'flashTestResults'), {
    ...result,
    createdAt: serverTimestamp(),
  })
}

export async function ensureSignedIn() {
  if (!auth) {
    throw new Error('Firebase Auth を初期化できません')
  }

  if (auth.currentUser) {
    return auth.currentUser
  }

  const credential = await signInAnonymously(auth)
  return credential.user
}

export async function uploadManualVideo(manualId: string, file: File) {
  if (!isFirebaseConfigured || !storage) {
    throw new Error('Firebase Storage 設定が未投入です')
  }

  await ensureSignedIn()

  const safeName = file.name.replace(/[^\w.-]/g, '_')
  const videoRef = ref(storage, `manualVideos/${manualId}/${Date.now()}-${safeName}`)
  await uploadBytes(videoRef, file, { contentType: file.type || 'video/mp4' })
  return getDownloadURL(videoRef)
}

export async function uploadManualImage(manualId: string, file: File) {
  if (!isFirebaseConfigured || !storage) {
    throw new Error('Firebase Storage 設定が未投入です')
  }

  await ensureSignedIn()

  const safeName = file.name.replace(/[^\w.-]/g, '_')
  const imageRef = ref(storage, `manualImages/${manualId}/materials/${Date.now()}-${safeName}`)
  await uploadBytes(imageRef, file, { contentType: file.type || 'image/jpeg' })
  return getDownloadURL(imageRef)
}

export async function uploadInspectionImage(
  manualId: string,
  stepId: number,
  kind: InspectionImageKind,
  file: File,
  variant: 'annotated' | 'original' = 'annotated',
) {
  if (!isFirebaseConfigured || !storage) {
    throw new Error('Firebase Storage 設定が未投入です')
  }

  await ensureSignedIn()

  const safeName = file.name.replace(/[^\w.-]/g, '_')
  const imageRef = ref(
    storage,
    `manualImages/${manualId}/steps/${stepId}/${kind}/${variant}/${Date.now()}-${safeName}`,
  )
  await uploadBytes(imageRef, file, { contentType: file.type || 'image/jpeg' })
  return getDownloadURL(imageRef)
}
