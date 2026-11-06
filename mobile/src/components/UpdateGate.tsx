import { Linking, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import type { MobileVersionInfo, VersionDecision } from '../domain/version';
import { colors } from '../theme/theme';

interface UpdateGateProps {
  currentVersion: string;
  info: MobileVersionInfo | null;
  decision: VersionDecision | null;
  dismissed: boolean;
  onDismiss: () => void;
}

export function UpdateGate({
  currentVersion,
  info,
  decision,
  dismissed,
  onDismiss,
}: UpdateGateProps) {
  const visible = Boolean(
    info?.androidDownloadUrl &&
      decision?.updateAvailable &&
      (!dismissed || decision.updateRequired),
  );

  if (!info || !decision) return null;

  const openDownload = async () => {
    if (info.androidDownloadUrl) await Linking.openURL(info.androidDownloadUrl);
  };

  return (
    <Modal
      animationType="fade"
      transparent
      visible={visible}
      onRequestClose={decision.updateRequired ? undefined : onDismiss}
    >
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.eyebrow}>YENİ SÜRÜM</Text>
          <Text style={styles.title}>
            {decision.updateRequired ? 'Devam etmek için güncelle' : 'Güncelleme hazır'}
          </Text>
          <Text style={styles.body}>
            Telefonundaki sürüm {currentVersion}, yeni sürüm {info.latestVersion}. APK'yı indirip
            mevcut uygulamanın üzerine kurabilirsin; dolabındaki kayıtlar silinmez.
          </Text>
          <Pressable style={styles.primaryButton} onPress={openDownload}>
            <Text style={styles.primaryLabel}>APK'yı indir</Text>
          </Pressable>
          {!decision.updateRequired && (
            <Pressable style={styles.secondaryButton} onPress={onDismiss}>
              <Text style={styles.secondaryLabel}>Daha sonra</Text>
            </Pressable>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: 'rgba(24, 23, 20, 0.62)',
  },
  card: {
    width: '100%',
    maxWidth: 420,
    gap: 14,
    padding: 24,
    borderRadius: 24,
    backgroundColor: colors.surface,
  },
  eyebrow: { color: colors.primary, fontSize: 12, fontWeight: '900', letterSpacing: 1.2 },
  title: { color: colors.text, fontSize: 24, fontWeight: '900' },
  body: { color: colors.muted, fontSize: 15, lineHeight: 22 },
  primaryButton: {
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    backgroundColor: colors.primary,
  },
  primaryLabel: { color: '#FFFFFF', fontSize: 16, fontWeight: '900' },
  secondaryButton: { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  secondaryLabel: { color: colors.text, fontSize: 15, fontWeight: '800' },
});
