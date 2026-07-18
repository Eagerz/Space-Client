import React from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';
import { SpaceColors } from '@/constants/Colors';
import { Fonts } from '@/constants/Fonts';
import { PrimaryButton } from '@/components/PrimaryButton';

type Props = {
  visible: boolean;
  title: string;
  message: string;
  checklist: string[];
  onClose: () => void;
};

export function GraphicsChecklistModal({
  visible,
  title,
  message,
  checklist,
  onClose,
}: Props) {
  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.message}>{message}</Text>
          {checklist.map((item) => (
            <Text key={item} style={styles.item}>
              • {item}
            </Text>
          ))}
          <PrimaryButton label="Got it" onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.72)',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: SpaceColors.bgElevated,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: SpaceColors.border,
    padding: 20,
    gap: 10,
  },
  title: {
    fontFamily: Fonts.ten,
    color: SpaceColors.text,
    fontSize: 20,
  },
  message: {
    fontFamily: Fonts.regular,
    color: SpaceColors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 4,
  },
  item: {
    fontFamily: Fonts.regular,
    color: SpaceColors.text,
    fontSize: 14,
    lineHeight: 20,
  },
});
