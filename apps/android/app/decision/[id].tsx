/**
 * The decision detail.
 *
 * Reading order is the whole design: what it changes, then what you can
 * do, then what happens if you say nothing, then how fresh it is, and the
 * technical evidence last and collapsed. Impact over implementation.
 *
 * The dock keeps "Other answer" and "Talk it through" in thumb reach
 * without crowding the options. When an answer is in its undo window the
 * dock gives way to the undo bar — one bottom surface at a time.
 */
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Linking as RnLinking, Pressable, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { tokens } from '@nod/design-tokens';
import type { DecisionView } from '@/api/types.js';
import { answerLabel, pendingRecordFromDecision, type PendingAnswerRecord } from '@/lib/undo.js';
import { answerBanner, cardBanner, defaultLine, formatAge, safeUrl } from '@/lib/format.js';
import { callAvailability, isOpenNow } from '@/lib/hours.js';
import { client, useAppStore, useDecision, useNow, useStatus } from '@/state.js';
import { border, radius, space, useColors } from '@/theme.js';
import { AppHeader } from '@/components/appbar';
import { PixelIcon } from '@/components/pixel';
import { YourAnswer, YourCall } from '@/components/options';
import { UndoBar, type UndoSpec } from '@/components/undo-bar';
import {
  Banner,
  Button,
  Callout,
  Label,
  NoticeStrip,
  Panel,
  Skeleton,
  T,
  Tag,
} from '@/components/ui';

function undoSpecFrom(d: DecisionView, pending: PendingAnswerRecord[]): UndoSpec | null {
  if (d.answer?.can_undo) {
    return {
      decisionId: d.id,
      label: answerLabel(d, d.answer),
      answeredAt: d.answer.answered_at,
      deliverAfter: d.answer.deliver_after,
    };
  }
  const rec = pending.find((r) => r.decisionId === d.id);
  if (!rec) return null;
  return {
    decisionId: rec.decisionId,
    label: rec.label,
    answeredAt: rec.answeredAt,
    deliverAfter: rec.deliverAfter,
  };
}

/** The collapsed technical evidence. Closed by default: it is not the brief. */
function Evidence({ decision }: { decision: DecisionView }) {
  const colors = useColors();
  const [open, setOpen] = useState(false);
  if (decision.evidence.length === 0) return null;
  return (
    <Panel>
      <Pressable
        onPress={() => setOpen((v) => !v)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: space[3],
          minHeight: tokens.size.control,
          paddingHorizontal: space[4],
        }}
      >
        <PixelIcon name="evidence" size={tokens.icon.md} color={colors.textDim} />
        <T step="small" color={colors.textDim} weight="600" style={{ flex: 1 }}>
          {`Technical evidence (${decision.evidence.length})`}
        </T>
        <PixelIcon
          name={open ? 'chevronDown' : 'chevronRight'}
          size={tokens.icon.sm}
          color={colors.textDim}
        />
      </Pressable>
      {open ? (
        <View
          style={{
            gap: space[3],
            paddingHorizontal: space[4],
            paddingBottom: space[4],
            borderTopWidth: border.hairline,
            borderTopColor: colors.line,
            paddingTop: space[3],
          }}
        >
          {decision.evidence.map((e, i) => (
            <View key={i} style={{ gap: space[1] }}>
              <T step="label" color={colors.textDim}>
                {e.label}
              </T>
              {e.text ? <T step="small">{e.text}</T> : null}
              {e.url ? (
                <T
                  step="small"
                  color={colors.accentInk}
                  onPress={() => {
                    const u = safeUrl(e.url!);
                    if (u) void RnLinking.openURL(u);
                  }}
                >
                  {e.url}
                </T>
              ) : null}
            </View>
          ))}
        </View>
      ) : null}
    </Panel>
  );
}

/** The free-text answer. One field, one send, cancel always available. */
function OtherAnswer({
  busy,
  onSend,
  onCancel,
}: {
  busy?: boolean;
  onSend: (text: string) => void;
  onCancel: () => void;
}) {
  const colors = useColors();
  const [text, setText] = useState('');
  const ready = text.trim().length > 0;
  return (
    <View style={{ gap: space[3] }}>
      <Label>Your own answer</Label>
      <TextInput
        value={text}
        onChangeText={setText}
        multiline
        autoFocus
        accessibilityLabel="Your own answer"
        placeholder="What should happen instead?"
        placeholderTextColor={colors.textFaint}
        style={{
          ...tokens.type.body,
          fontWeight: '400',
          backgroundColor: colors.surface,
          borderWidth: border.hairline,
          borderColor: colors.lineStrong,
          borderRadius: radius,
          color: colors.text,
          minHeight: space[8] + space[4],
          padding: space[3],
          textAlignVertical: 'top',
        }}
      />
      <View style={{ flexDirection: 'row', gap: space[3] }}>
        <Button label="Cancel" tone="outline" grow onPress={onCancel} disabled={busy} />
        <Button
          label="Send"
          icon="send"
          tone="primary"
          grow
          disabled={busy || !ready}
          onPress={() => onSend(text.trim())}
        />
      </View>
    </View>
  );
}

/** The loading detail: the same shape as the real one, so nothing jumps. */
function LoadingDetail() {
  return (
    <View style={{ padding: space[4], gap: space[4] }}>
      <Skeleton height={20} width="50%" />
      <Skeleton height={28} width="85%" />
      <Skeleton height={16} />
      <Skeleton height={16} />
      <Skeleton height={16} width="70%" />
      <Skeleton height={tokens.size.control + space[5]} />
      <Skeleton height={tokens.size.control + space[5]} />
    </View>
  );
}

export default function DecisionDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const decisionId = id ?? '';
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const now = useNow();
  const { data: d, refetch } = useDecision(decisionId);
  const { data: status } = useStatus();
  const live = useAppStore((s) => s.live);
  const pending = useAppStore((s) => s.pending);
  const [showOther, setShowOther] = useState(false);
  const [busy, setBusy] = useState(false);

  const act = async (fn: () => Promise<unknown>): Promise<void> => {
    const c = client();
    if (!c) return;
    setBusy(true);
    try {
      const out = (await fn()) as DecisionView | undefined;
      if (out) {
        const rec = pendingRecordFromDecision(out);
        const store = useAppStore.getState();
        try {
          // A local persistence failure must not skip the refetch: the
          // answer is already safe on core, and reconcilePending re-derives
          // the record from the live decision on the next foreground.
          if (rec) await store.rememberAnswer(rec);
          else await store.forgetAnswer(decisionId);
        } catch {
          // Swallowed on purpose — the refetch below still runs.
        }
      }
      await refetch();
    } catch {
      // The live state (and the server's error) shows when the refetch lands.
    } finally {
      setBusy(false);
    }
  };

  if (!d) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <AppHeader title="Decision" onBack={() => router.back()} />
        <LoadingDetail />
      </View>
    );
  }

  const answerState = answerBanner(d.answer, now);
  const stateLine = cardBanner(d, now);
  const external = d.provenance.kind === 'external';
  const urgent = d.urgency === 'urgent';
  const open = d.status === 'open' && !d.answer;
  const freshSeconds = Math.max(0, (now - new Date(d.freshness.last_checked_at).getTime()) / 1000);
  const staleFresh = status !== undefined && freshSeconds > status.reconciler_interval_seconds;
  const undoSpec = undoSpecFrom(d, pending);
  const source = [d.source.system, d.source.agent].filter(Boolean).join(' · ');
  const defaults = defaultLine(d, now);
  const callOpen = isOpenNow(now);
  const callNote = callAvailability(now);

  /** Repair actions, mirroring the Attention filter so both places agree. */
  const repair: {
    label: string;
    icon: 'refresh' | 'send' | 'close';
    danger?: boolean;
    run: () => void;
  }[] = [];
  if (d.status === 'stale' || d.status === 'expired')
    repair.push({
      label: 'Re-ask',
      icon: 'refresh',
      run: () => void act(() => client()!.reask(decisionId)),
    });
  // The design doc's attention table: failed → Retry, Force refresh;
  // Withdraw belongs to stale and expired, not to failed.
  if (d.status === 'failed') {
    repair.push({
      label: 'Retry',
      icon: 'send',
      run: () => void act(() => client()!.reask(decisionId)),
    });
    repair.push({
      label: 'Force refresh',
      icon: 'refresh',
      run: () => void act(() => client()!.refresh(decisionId)),
    });
  }
  if (d.status === 'stale' || d.status === 'expired')
    repair.push({
      label: 'Withdraw',
      icon: 'close',
      danger: true,
      run: () => void act(() => client()!.withdraw(decisionId)),
    });

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppHeader title="Decision" onBack={() => router.back()} />

      {!live ? (
        <NoticeStrip
          tone="offline"
          title="Offline. Showing what you had."
          detail="Answering needs a connection."
        />
      ) : null}

      <ScrollView
        contentContainerStyle={{
          padding: space[4],
          paddingBottom: space[6],
          gap: space[4],
        }}
        keyboardShouldPersistTaps="handled"
      >
        {/* The decision itself is one bracketed panel: tags, title and impact
            read as a single object, and the brackets say it needs David. */}
        <Panel tone={open ? (urgent ? 'urgent' : 'needsYou') : 'plain'}>
          <View style={{ gap: space[4], padding: space[4] }}>
            <View style={{ flexDirection: 'row', gap: space[2], flexWrap: 'wrap' }}>
              {urgent ? (
                <Tag tone="urgent" icon="alert">
                  Urgent
                </Tag>
              ) : null}
              {answerState ? (
                <Tag tone="answered" icon="check">
                  Answered
                </Tag>
              ) : null}
              {external ? (
                <Tag tone="external" icon="mail">
                  {d.provenance.origin ? `From ${d.provenance.origin}` : 'From outside'}
                </Tag>
              ) : null}
              {source ? (
                <Tag tone="source" icon="agent">
                  {source}
                </Tag>
              ) : null}
            </View>

            {/* The title and the impact share the `lead` step; weight carries
                the hierarchy. The mockups draw the title larger than any step
                in the scale — reported as a token proposal rather than
                inlined here. */}
            <T step="lead" weight="700">
              {d.glance.title}
            </T>

            <View style={{ gap: space[2] }}>
              <Label>Impact</Label>
              <T step="lead">{d.impact}</T>
            </View>
          </View>
        </Panel>

        {external ? (
          <Callout title={`From outside${d.provenance.origin ? `: ${d.provenance.origin}` : ''}`}>
            Every option writes back to the sender. Nod never answers this for you: no default, no
            rules, no one-tap answer from a notification.
          </Callout>
        ) : null}

        {answerState ? (
          <>
            <YourAnswer decision={d} label={answerLabel(d, d.answer!)} />
            {answerState.kind !== 'undo' ? (
              <Banner kind={answerState.kind}>{answerState.text}</Banner>
            ) : null}
          </>
        ) : open ? (
          showOther ? (
            <OtherAnswer
              busy={busy}
              onCancel={() => setShowOther(false)}
              onSend={(text) => {
                setShowOther(false);
                void act(() => client()!.answer(decisionId, { otherText: text }));
              }}
            />
          ) : (
            <YourCall
              decision={d}
              busy={busy}
              disabled={busy || !live}
              onAnswer={(optionId) => void act(() => client()!.answer(decisionId, { optionId }))}
            />
          )
        ) : stateLine ? (
          <View style={{ gap: space[3] }}>
            <Banner kind={stateLine.kind}>{stateLine.text}</Banner>
            {repair.length > 0 ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
                {repair.map((r) => (
                  <Button
                    key={r.label}
                    label={r.label}
                    icon={r.icon}
                    tone={r.danger ? 'danger' : 'outline'}
                    compact
                    disabled={busy}
                    onPress={r.run}
                  />
                ))}
              </View>
            ) : null}
          </View>
        ) : null}

        {open && defaults ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
            <PixelIcon name="clock" size={tokens.icon.md} color={colors.textDim} />
            <T step="body" color={colors.textDim} style={{ flex: 1 }}>
              {defaults}
            </T>
          </View>
        ) : open && !isOpenNow(now) && !urgent ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
            <PixelIcon name="moon" size={tokens.icon.md} color={colors.textDim} />
            <T step="body" color={colors.textDim} style={{ flex: 1 }}>
              If you say nothing: paused until 8:00 am.
            </T>
          </View>
        ) : null}

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
          <PixelIcon
            name="refresh"
            size={tokens.icon.md}
            color={staleFresh ? colors.amber : colors.textDim}
          />
          <T step="small" color={staleFresh ? colors.amber : colors.textDim} style={{ flex: 1 }}>
            {`Checked ${formatAge(freshSeconds)} ago`}
            {staleFresh ? ' · worth a refresh' : ''}
          </T>
          <Button
            label="Refresh"
            compact
            disabled={busy || !live}
            onPress={() => void act(() => client()!.refresh(decisionId))}
          />
        </View>

        <Evidence decision={d} />
      </ScrollView>

      {undoSpec ? (
        <UndoBar
          spec={undoSpec}
          now={now}
          busy={busy}
          onUndo={() => void act(() => client()!.undo(decisionId))}
        />
      ) : open && !showOther && (d.allow_other || d.allow_call) ? (
        <View
          style={{
            flexDirection: 'row',
            gap: space[3],
            padding: space[4],
            paddingBottom: insets.bottom + space[4],
            borderTopWidth: border.hairline,
            borderTopColor: colors.line,
            backgroundColor: colors.bg,
          }}
        >
          {d.allow_other ? (
            <Button
              label="Other answer"
              icon="other"
              grow
              disabled={!live}
              onPress={() => setShowOther(true)}
            />
          ) : null}
          {d.allow_call ? (
            <Button
              label="Talk it through"
              icon="call"
              grow
              disabled
              accessibilityHint={
                callOpen ? 'Call Me arrives in a later update' : (callNote ?? undefined)
              }
            />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
