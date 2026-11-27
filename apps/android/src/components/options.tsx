/**
 * "Your call": the option buttons, and the confirm sheet that guards a
 * write from outside input.
 *
 * The recommended option is the one green thing on the screen, so the eye
 * lands on it first — except when the provenance is external, where every
 * option stays outlined and nothing is pre-picked. That is an ethics rule,
 * not a style choice: Nod must not nudge an answer that leaves the company.
 */
import { useState } from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { tokens } from '@nod/design-tokens';
import type { DecisionView } from '@/api/types.js';
import { border, radius, space, useColors } from '@/theme.js';
import { Brackets, Button, Label, Panel, T } from './ui';
import { PixelIcon } from './pixel';

type Option = DecisionView['options'][number];

function OptionButton({
  option,
  recommended,
  primary,
  markWrites,
  disabled,
  onPress,
}: {
  option: Option;
  recommended: boolean;
  primary: boolean;
  /** Only when it tells the options apart — see YourCall. */
  markWrites: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  const colors = useColors();
  const fg = primary ? colors.onAccent : colors.text;
  const sub = primary ? colors.onAccent : colors.textDim;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      accessibilityLabel={`${option.label}${recommended ? ', recommended' : ''}. ${option.outcome}`}
      style={({ pressed }) => ({
        minHeight: tokens.size.control,
        padding: space[4],
        gap: space[2],
        borderRadius: radius,
        borderWidth: border.hairline,
        borderColor: primary ? colors.accent : colors.lineStrong,
        backgroundColor: primary ? colors.accent : pressed ? colors.surfaceRaised : colors.surface,
        opacity: disabled ? 0.45 : 1,
      })}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
        {primary ? <PixelIcon name="chevronRight" size={tokens.icon.sm + 4} color={fg} /> : null}
        <T step="title" color={fg} style={{ flex: 1 }}>
          {option.label}
        </T>
        {recommended ? (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: space[1],
              paddingHorizontal: space[2],
              paddingVertical: space[1],
              borderWidth: border.hairline,
              borderColor: fg,
              borderRadius: radius,
            }}
          >
            <PixelIcon name="star" size={tokens.icon.sm} color={fg} />
            <T step="label" color={fg} weight="700">
              Recommended
            </T>
          </View>
        ) : null}
      </View>
      <T step="small" color={sub}>
        {option.outcome}
      </T>
      {(markWrites && option.writes) || option.reversible === false ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[1] }}>
          <PixelIcon name="write" size={tokens.icon.sm} color={primary ? fg : colors.amber} />
          <T step="label" color={primary ? fg : colors.amber} weight="600">
            {option.reversible === false ? 'Not reversible' : 'Changes something'}
          </T>
        </View>
      ) : null}
    </Pressable>
  );
}

/**
 * The confirm sheet for a write from outside input: the option, who it
 * reaches, a preview when the source supplies one, and the reminder that
 * the undo window still applies. Cancel sits first and is the wider target
 * on the left, so the destructive path is never the accidental one.
 */
function ConfirmSheet({
  decision,
  option,
  busy,
  onCancel,
  onConfirm,
}: {
  decision: DecisionView;
  option: Option;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const preview = decision.evidence.find((e) => e.kind === 'diff_summary' || !!e.text)?.text;
  const origin = decision.provenance.origin;

  return (
    <Modal transparent animationType="slide" onRequestClose={onCancel} statusBarTranslucent>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close"
        onPress={onCancel}
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' }}
      />
      <View
        style={{
          backgroundColor: colors.surface,
          borderTopWidth: border.hairline,
          borderTopColor: colors.lineStrong,
          paddingBottom: insets.bottom + space[4],
        }}
      >
        <Brackets color={colors.accentInk} inset={space[1]} />
        <View style={{ alignItems: 'center', paddingVertical: space[3] }}>
          <View style={{ width: space[8], height: space[1], backgroundColor: colors.lineStrong }} />
        </View>
        <View style={{ paddingHorizontal: space[4], gap: space[3] }}>
          <Label>Confirm before it sends</Label>
          <T step="lead" weight="700">
            {option.label}
          </T>
          <T step="body" color={colors.textDim}>
            {origin ? `To ${origin}. ` : ''}
            Nod never answers outside input for you. You still get the undo window after this.
          </T>
          {preview ? (
            <ScrollView
              style={{
                maxHeight: 160,
                borderWidth: border.hairline,
                borderColor: colors.line,
                backgroundColor: colors.surfaceRaised,
              }}
            >
              {/* The preview is the literal text that leaves the company, so
                  it is set in the mono face: it reads as a quotation, not as
                  Nod's own words. */}
              <T
                step="small"
                color={colors.text}
                style={{ padding: space[3], fontFamily: 'monospace' }}
              >
                {preview}
              </T>
            </ScrollView>
          ) : null}
          <View style={{ flexDirection: 'row', gap: space[3], marginTop: space[2] }}>
            <Button label="Cancel" tone="outline" grow onPress={onCancel} disabled={busy} />
            <Button
              label="Send reply"
              icon="send"
              tone="primary"
              grow
              onPress={onConfirm}
              disabled={busy}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

export function YourCall({
  decision,
  onAnswer,
  disabled,
  busy,
}: {
  decision: DecisionView;
  onAnswer: (optionId: string) => void;
  disabled?: boolean;
  busy?: boolean;
}) {
  const external = decision.provenance.kind === 'external';
  const [confirming, setConfirming] = useState<Option | null>(null);

  // "Changes something" on every option says nothing. It only earns its
  // place when it separates one option from another.
  const markWrites =
    decision.options.some((o) => o.writes) && decision.options.some((o) => !o.writes);

  return (
    <View style={{ gap: space[3] }}>
      <Label>Your call</Label>
      {decision.options.map((o) => (
        <OptionButton
          key={o.id}
          option={o}
          markWrites={markWrites}
          recommended={o.id === decision.recommended}
          primary={o.id === decision.recommended && !external}
          disabled={disabled}
          onPress={() => (external ? setConfirming(o) : onAnswer(o.id))}
        />
      ))}
      {confirming ? (
        <ConfirmSheet
          decision={decision}
          option={confirming}
          busy={busy}
          onCancel={() => setConfirming(null)}
          onConfirm={() => {
            const id = confirming.id;
            setConfirming(null);
            onAnswer(id);
          }}
        />
      ) : null}
    </View>
  );
}

/** The answered state: the check, the outcome, and what happens next. */
export function YourAnswer({ decision, label }: { decision: DecisionView; label: string }) {
  const colors = useColors();
  const outcome = decision.options.find((o) => o.id === decision.answer?.option_id)?.outcome;
  const agent = decision.source.agent ?? decision.source.system;
  return (
    <View style={{ gap: space[3] }}>
      <Label>Your answer</Label>
      <Panel>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'flex-start',
            gap: space[3],
            padding: space[4],
          }}
        >
          <PixelIcon name="check" size={tokens.icon.md} color={colors.accentInk} />
          <View style={{ flex: 1, gap: space[1] }}>
            <T step="title">{label}</T>
            {outcome ? (
              <T step="small" color={colors.textDim}>
                {outcome}
              </T>
            ) : null}
          </View>
        </View>
      </Panel>
      <T step="body" color={colors.textDim}>
        {`Nod re-checks the source when the bar empties, then tells ${agent}. If anything changed in the meantime, it comes back to you instead.`}
      </T>
    </View>
  );
}
