import { Stack } from "expo-router/stack";
import {
  Text,
  View,
  useWindowDimensions,
} from "react-native";

import { colors } from "@/theme";
import { Haptics, impactHaptic } from "@/utils/haptics";

interface HeaderActionProps {
  title: string;
  eyebrow: string;
  accessibilityLabel: string;
  onPress: () => void;
  gestureEnabled?: boolean;
}

const TITLE_HEIGHT = 42;
const TITLE_MAX_WIDTH = 280;

function HeaderTitleText({
  title,
  eyebrow,
  width,
}: {
  title: string;
  eyebrow: string;
  width: number;
}) {
  return (
    <View
      style={{
        width,
        height: TITLE_HEIGHT,
        justifyContent: "center",
      }}
    >
      <Text
        accessible={false}
        numberOfLines={1}
        style={{
          color: colors.titleCoral,
          fontSize: 9.5,
          lineHeight: 11,
          fontWeight: "900",
          letterSpacing: 1.05,
          textAlign: "left",
        }}
      >
        {eyebrow}
      </Text>
      <Text
        accessibilityRole="header"
        accessibilityLabel={`${eyebrow}. ${title}`}
        numberOfLines={1}
        ellipsizeMode="tail"
        style={{
          color: colors.ink,
          fontSize: 17.5,
          lineHeight: 20,
          fontWeight: "900",
          textAlign: "left",
        }}
      >
        {title}
      </Text>
    </View>
  );
}

function runHeaderAction(onPress: () => void) {
  impactHaptic(Haptics.ImpactFeedbackStyle.Light);
  onPress();
}

/**
 * Configures a real native navigation title and UIBarButtonItem. Sizing,
 * background material, press animation, and iOS 26 glass are owned by the
 * native stack; only Buki's accent tint is supplied.
 */
export function NativeDoneHeader({
  title,
  eyebrow,
  accessibilityLabel,
  onPress,
  gestureEnabled,
}: HeaderActionProps) {
  const { width } = useWindowDimensions();
  const titleWidth = Math.max(132, Math.min(TITLE_MAX_WIDTH, width - 112));

  return (
    <>
      {gestureEnabled === undefined ? null : (
        <Stack.Screen options={{ gestureEnabled }} />
      )}
      <Stack.Title>{""}</Stack.Title>
      <Stack.Toolbar placement="left">
        <Stack.Toolbar.View hidesSharedBackground>
          <HeaderTitleText
            title={title}
            eyebrow={eyebrow}
            width={titleWidth}
          />
        </Stack.Toolbar.View>
      </Stack.Toolbar>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button
          variant="done"
          tintColor={colors.titleTeal}
          accessibilityLabel={accessibilityLabel}
          onPress={() => runHeaderAction(onPress)}
        >
          Done
        </Stack.Toolbar.Button>
      </Stack.Toolbar>
    </>
  );
}

export function NativeCloseHeader({
  title,
  eyebrow,
  accessibilityLabel,
  onPress,
  gestureEnabled,
}: HeaderActionProps) {
  const { width } = useWindowDimensions();
  const titleWidth = Math.max(132, Math.min(TITLE_MAX_WIDTH, width - 92));

  return (
    <>
      {gestureEnabled === undefined ? null : (
        <Stack.Screen options={{ gestureEnabled }} />
      )}
      <Stack.Title>{""}</Stack.Title>
      <Stack.Toolbar placement="left">
        <Stack.Toolbar.Button
          icon="xmark"
          variant="plain"
          tintColor={colors.titleTeal}
          accessibilityLabel={accessibilityLabel}
          onPress={() => runHeaderAction(onPress)}
        />
        <Stack.Toolbar.View hidesSharedBackground>
          <HeaderTitleText
            title={title}
            eyebrow={eyebrow}
            width={titleWidth}
          />
        </Stack.Toolbar.View>
      </Stack.Toolbar>
    </>
  );
}
