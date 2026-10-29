import * as LocalAuthentication from 'expo-local-authentication';
import { Alert } from 'react-native';

/**
 * Prompts user for biometric authentication (Face ID, Fingerprint, or Device PIN).
 * Returns true if authenticated, or if the device has no biometrics configured.
 */
export async function authenticateWithBiometrics(
  promptMessage: string = 'Confirm your identity to modify security settings'
): Promise<boolean> {
  try {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    if (!hasHardware) {
      // Device lacks biometric hardware
      return true;
    }

    const isEnrolled = await LocalAuthentication.isEnrolledAsync();
    if (!isEnrolled) {
      // Device has hardware but user hasn't enrolled biometrics
      return true;
    }

    const result = await LocalAuthentication.authenticateAsync({
      promptMessage,
      fallbackLabel: 'Use Device PIN / Password',
      cancelLabel: 'Cancel',
      disableDeviceFallback: false,
    });

    if (!result.success) {
      if (result.error !== 'user_cancel' && result.error !== 'app_cancel') {
        Alert.alert('Authentication Failed', 'Identity verification could not be completed.');
      }
      return false;
    }

    return true;
  } catch (e: any) {
    console.error('[security] Biometric verification error:', e);
    return false;
  }
}
