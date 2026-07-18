import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  type PressableProps,
} from 'react-native';
import { SpaceColors } from '@/constants/Colors';
import { Fonts } from '@/constants/Fonts';
import { useAccent } from '@/theme/AccentContext';

type Props = PressableProps & {
  label: string;
  loading?: boolean;
  variant?: 'primary' | 'ghost' | 'danger';
};

export function PrimaryButton({
  label,
  loading,
  variant = 'primary',
  disabled,
  style,
  ...rest
}: Props) {
  const { accent } = useAccent();
  const isPrimary = variant === 'primary';
  const isDanger = variant === 'danger';
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.base,
        isPrimary && { backgroundColor: accent.value },
        variant === 'ghost' && styles.ghost,
        isDanger && styles.danger,
        (disabled || loading) && styles.disabled,
        pressed && !disabled && styles.pressed,
        typeof style === 'function' ? undefined : style,
      ]}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color={isPrimary ? '#04131a' : accent.value} />
      ) : (
        <Text
          style={[
            styles.label,
            isPrimary && styles.labelOnPrimary,
            variant === 'ghost' && styles.labelGhost,
            isDanger && styles.labelDanger,
          ]}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  ghost: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: SpaceColors.border,
  },
  danger: {
    backgroundColor: 'rgba(248, 113, 113, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(248, 113, 113, 0.45)',
  },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.88 },
  label: {
    fontFamily: Fonts.ten,
    fontSize: 15,
    letterSpacing: 0.5,
  },
  labelOnPrimary: { color: '#04131a' },
  labelGhost: { color: SpaceColors.text, fontFamily: Fonts.ten },
  labelDanger: { color: SpaceColors.danger, fontFamily: Fonts.ten },
});
