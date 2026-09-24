import { Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';

export type PhotoSource = 'library' | 'camera';

async function ensureLibraryPermission(): Promise<boolean> {
  const current = await ImagePicker.getMediaLibraryPermissionsAsync();
  if (current.granted) return true;
  const asked = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (asked.granted) return true;
  Alert.alert(
    'Accès photos refusé',
    'Autorise l’accès à ta photothèque dans les réglages pour ajouter une photo de profil sur Chance.',
  );
  return false;
}

async function ensureCameraPermission(): Promise<boolean> {
  const current = await ImagePicker.getCameraPermissionsAsync();
  if (current.granted) return true;
  const asked = await ImagePicker.requestCameraPermissionsAsync();
  if (asked.granted) return true;
  Alert.alert(
    'Accès caméra refusé',
    'Autorise l’accès à l’appareil photo dans les réglages pour prendre une photo de profil.',
  );
  return false;
}

async function launch(
  source: PhotoSource,
): Promise<string | undefined> {
  const ok =
    source === 'library'
      ? await ensureLibraryPermission()
      : await ensureCameraPermission();
  if (!ok) return undefined;

  const result =
    source === 'library'
      ? await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          allowsEditing: true,
          aspect: [1, 1],
          quality: 0.8,
        })
      : await ImagePicker.launchCameraAsync({
          mediaTypes: ['images'],
          allowsEditing: true,
          aspect: [1, 1],
          quality: 0.8,
        });

  if (result.canceled || !result.assets?.[0]?.uri) return undefined;
  return result.assets[0].uri;
}

/** Alert with Bibliothèque / Appareil photo; returns local URI or undefined. */
export function pickProfilePhoto(): Promise<string | undefined> {
  return new Promise((resolve) => {
    Alert.alert('Photo de profil', 'Choisis une source', [
      {
        text: 'Bibliothèque',
        onPress: () => {
          void launch('library').then(resolve);
        },
      },
      {
        text: 'Appareil photo',
        onPress: () => {
          void launch('camera').then(resolve);
        },
      },
      {
        text: 'Annuler',
        style: 'cancel',
        onPress: () => resolve(undefined),
      },
    ]);
  });
}
