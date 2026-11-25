/**
 * PROVISIONAL UI (BYT-753). The decision detail, following the web detail
 * top to bottom: tags, title, impact, options (the recommended one green,
 * none green for external provenance), the default line, freshness with
 * Refresh, the collapsed evidence, and the dock with Other / Talk it
 * through. Answering starts the undo window; the docked bar (or a record
 * restored from encrypted storage) carries it until core delivers.
 */
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Linking as RnLinking,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { answerLabel, pendingRecordFromDecision, type PendingAnswerRecord } from '@/lib/undo.js';
import { answerBanner, cardBanner, defaultLine, formatAge, safeUrl } from '@/lib/format.js';
import { callAvailability, isOpenNow } from '@/lib/hours.js';
import { useAppStore, useDecision, useNow, useStatus, client } from '@/state.js';
import { useColors } from '@/theme.js';
import { StatusBanner, Tag } from '@/components/bits';
import { UndoBar, type UndoSpec } from '@/components/undo-bar';
import { PixelIcon } from '@/components/pixel';
import type { DecisionView } from '@/api/types.js';

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

function Options({ d, onAnswer }: { d: DecisionView; onAnswer: (optId: string) => void }) {
  const colors = useColors();
  const external = d.provenance.kind === 'external';
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const pick = (optId: string): void => {
    // Internal decisions answer in one tap; external writes need the confirm step.
    if (!external) {
      onAnswer(optId);
    } else {
      setConfirming(optId);
    }
  };

  const confirm = async (): Promise<void> => {
    if (!confirming) return;
    setBusy(true);
    try {
      onAnswer(confirming);
      setConfirming(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ gap: 8 }}>
      <Text
        style={{
          color: colors.textDim,
          fontSize: 11,
          fontWeight: '700',
          textTransform: 'uppercase',
          letterSpacing: 1,
        }}
      >
        Your call
      </Text>
      {d.options.map((o) => {
        const recommended = o.id === d.recommended;
        const primary = recommended && !external;
        return (
          <Pressable
            key={o.id}
            onPress={() => pick(o.id)}
            accessibilityRole="button"
            style={{
              backgroundColor: primary ? colors.accent : colors.surface,
              borderColor: primary ? colors.accent : colors.lineStrong,
              borderWidth: 1,
              borderRadius: 2,
              padding: 14,
              gap: 4,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              {recommended ? (
                <PixelIcon
                  name="star"
                  cell={2}
                  color={primary ? colors.onAccent : colors.accentInk}
                />
              ) : null}
              <Text
                style={{
                  color: primary ? colors.onAccent : colors.text,
                  fontSize: 15,
                  fontWeight: '700',
                  flex: 1,
                }}
              >
                {o.label}
                {o.writes ? '  (changes something)' : ''}
              </Text>
            </View>
            <Text style={{ color: primary ? colors.onAccent : colors.textDim, fontSize: 13 }}>
              {o.outcome}
            </Text>
            {!o.reversible ? (
              <Text style={{ color: primary ? colors.onAccent : colors.amber, fontSize: 11 }}>
                Not reversible
              </Text>
            ) : null}
          </Pressable>
        );
      })}
      {confirming ? (
        <View
          style={{
            backgroundColor: colors.amberDeep,
            borderRadius: 2,
            padding: 14,
            gap: 10,
            borderLeftWidth: 3,
            borderLeftColor: colors.amber,
          }}
        >
          <Text style={{ color: colors.amber, fontSize: 14, fontWeight: '600' }}>
            Send this reply?
          </Text>
          <Text style={{ color: colors.text, fontSize: 13 }}>
            {d.options.find((o) => o.id === confirming)?.label} — this writes to the source, and Nod
            never answers outside input for you.
          </Text>
          <View style={{ flexDirection: 'row', gap: 8, justifyContent: 'flex-end' }}>
            <Pressable onPress={() => setConfirming(null)} accessibilityRole="button">
              <Text style={{ color: colors.textDim, fontSize: 14 }}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={() => void confirm()}
              disabled={busy}
              accessibilityRole="button"
              style={{
                backgroundColor: colors.accent,
                paddingHorizontal: 14,
                paddingVertical: 8,
                borderRadius: 2,
              }}
            >
              {busy ? (
                <ActivityIndicator color={colors.onAccent} />
              ) : (
                <Text style={{ color: colors.onAccent, fontSize: 14, fontWeight: '700' }}>
                  Send reply
                </Text>
              )}
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}

export default function DecisionDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const decisionId = id ?? '';
  const colors = useColors();
  const now = useNow();
  const { data: d, refetch } = useDecision(decisionId);
  const { data: status } = useStatus();
  const live = useAppStore((s) => s.live);
  const pending = useAppStore((s) => s.pending);
  const [otherText, setOtherText] = useState('');
  const [showOther, setShowOther] = useState(false);
  const [evidenceOpen, setEvidenceOpen] = useState(false);
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
        if (rec) await store.rememberAnswer(rec);
        else await store.forgetAnswer(decisionId);
      }
      await refetch();
    } catch {
      // The live state (and the server's error) shows when the refetch lands.
    } finally {
      setBusy(false);
    }
  };

  const answerOption = (optId: string): void => {
    void act(() => client()!.answer(decisionId, { optionId: optId }));
  };

  if (!d) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: colors.bg,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <ActivityIndicator color={colors.accentInk} />
      </View>
    );
  }

  const banner = answerBanner(d.answer, now);
  const stateLine = cardBanner(d, now);
  const external = d.provenance.kind === 'external';
  const freshMs = now - new Date(d.freshness.last_checked_at).getTime();
  const staleFresh = status !== undefined && freshMs > status.reconciler_interval_seconds * 1000;
  const undoSpec = undoSpecFrom(d, pending);
  const callNote = callAvailability(now);
  const callOpen = isOpenNow(now);
  const source = [d.source.system, d.source.agent].filter(Boolean).join(' · ');

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 16 }}
        keyboardShouldPersistTaps="handled"
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <Pressable
            onPress={() => router.back()}
            accessibilityRole="button"
            style={{ padding: 8 }}
          >
            <PixelIcon name="back" cell={3} color={colors.textDim} />
          </Pressable>
          <Text style={{ color: colors.textDim, fontSize: 12, flex: 1 }}>{source}</Text>
        </View>

        <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
          {d.urgency === 'urgent' ? <Tag tone="urgent">Urgent</Tag> : null}
          {external ? <Tag tone="external">From external</Tag> : null}
          {d.options.some((o) => o.writes) ? <Tag tone="write">Writes</Tag> : null}
        </View>

        <View style={{ gap: 6 }}>
          <Text style={{ color: colors.text, fontSize: 19, fontWeight: '700' }}>
            {d.glance.title}
          </Text>
          <Text style={{ color: colors.textDim, fontSize: 15 }}>{d.glance.question}</Text>
        </View>

        <Text style={{ color: colors.text, fontSize: 17, lineHeight: 26 }}>{d.impact}</Text>

        {external ? (
          <View
            style={{
              backgroundColor: colors.amberDeep,
              borderLeftWidth: 3,
              borderLeftColor: colors.amber,
              borderRadius: 2,
              padding: 12,
            }}
          >
            <Text style={{ color: colors.amber, fontSize: 13 }}>
              From outside
              {d.provenance.origin ? `: ${d.provenance.origin}` : ''}. Nod never answers this for
              you: no default, no rules, no one-tap answer from a notification.
            </Text>
          </View>
        ) : null}

        {d.answer ? (
          banner ? (
            <StatusBanner kind={banner.kind}>{banner.text}</StatusBanner>
          ) : stateLine ? (
            <StatusBanner kind={stateLine.kind}>{stateLine.text}</StatusBanner>
          ) : null
        ) : d.status === 'open' ? (
          <Options d={d} onAnswer={answerOption} />
        ) : stateLine ? (
          <View style={{ gap: 10 }}>
            <StatusBanner kind={stateLine.kind}>{stateLine.text}</StatusBanner>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {(d.status === 'stale' || d.status === 'failed') && !busy ? (
                <Pressable
                  onPress={() => void act(() => client()!.reask(decisionId))}
                  accessibilityRole="button"
                  style={{
                    backgroundColor: colors.surface,
                    borderColor: colors.lineStrong,
                    borderWidth: 1,
                    borderRadius: 2,
                    paddingHorizontal: 14,
                    paddingVertical: 10,
                  }}
                >
                  <Text style={{ color: colors.text, fontSize: 14, fontWeight: '600' }}>
                    Re-ask
                  </Text>
                </Pressable>
              ) : null}
              {d.status === 'failed' && !busy ? (
                <Pressable
                  onPress={() => void act(() => client()!.refresh(decisionId))}
                  accessibilityRole="button"
                  style={{
                    backgroundColor: colors.surface,
                    borderColor: colors.lineStrong,
                    borderWidth: 1,
                    borderRadius: 2,
                    paddingHorizontal: 14,
                    paddingVertical: 10,
                  }}
                >
                  <Text style={{ color: colors.text, fontSize: 14, fontWeight: '600' }}>Retry</Text>
                </Pressable>
              ) : null}
              {(d.status === 'stale' || d.status === 'failed' || d.status === 'expired') &&
              !busy ? (
                <Pressable
                  onPress={() => void act(() => client()!.withdraw(decisionId))}
                  accessibilityRole="button"
                  style={{
                    backgroundColor: colors.surface,
                    borderColor: colors.lineStrong,
                    borderWidth: 1,
                    borderRadius: 2,
                    paddingHorizontal: 14,
                    paddingVertical: 10,
                  }}
                >
                  <Text style={{ color: colors.red, fontSize: 14, fontWeight: '600' }}>
                    Withdraw
                  </Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        ) : null}

        {!d.answer &&
        !defaultLine(d, now) &&
        d.status === 'open' &&
        d.urgency !== 'urgent' &&
        !isOpenNow(now) ? (
          <Text style={{ color: colors.textDim, fontSize: 13 }}>
            The default is paused until 8:00 am Phoenix.
          </Text>
        ) : null}
        {defaultLine(d, now) ? (
          <Text style={{ color: colors.textDim, fontSize: 14 }}>{defaultLine(d, now)}</Text>
        ) : null}

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text
            style={{ color: staleFresh ? colors.amber : colors.textDim, fontSize: 13, flex: 1 }}
          >
            {`Checked ${formatAge(Math.max(0, (now - new Date(d.freshness.last_checked_at).getTime()) / 1000))} ago`}
            {staleFresh ? ' · a while now' : ''}
          </Text>
          <Pressable
            onPress={() => void act(() => client()!.refresh(decisionId))}
            disabled={busy}
            accessibilityRole="button"
            style={{
              backgroundColor: colors.surface,
              borderColor: colors.lineStrong,
              borderWidth: 1,
              borderRadius: 2,
              paddingHorizontal: 12,
              paddingVertical: 8,
            }}
          >
            <Text style={{ color: colors.text, fontSize: 13, fontWeight: '600' }}>Refresh</Text>
          </Pressable>
        </View>

        {d.evidence.length > 0 ? (
          <View
            style={{
              backgroundColor: colors.surface,
              borderColor: colors.line,
              borderWidth: 1,
              borderRadius: 2,
              padding: 14,
              gap: 8,
            }}
          >
            <Pressable
              onPress={() => setEvidenceOpen((v) => !v)}
              accessibilityRole="button"
              style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
            >
              <Text style={{ color: colors.textDim, fontSize: 13, flex: 1 }}>
                {`Technical evidence (${d.evidence.length})`}
              </Text>
              <PixelIcon
                name={evidenceOpen ? 'chevronDown' : 'chevronRight'}
                cell={2}
                color={colors.textDim}
              />
            </Pressable>
            {evidenceOpen
              ? d.evidence.map((e, i) => (
                  <View key={i} style={{ gap: 2 }}>
                    <Text style={{ color: colors.text, fontSize: 13 }}>
                      {e.label}
                      {e.kind === 'diff_summary'
                        ? ` — ${e.text ?? ''}`
                        : e.text
                          ? ` — ${e.text}`
                          : ''}
                    </Text>
                    {e.url ? (
                      <Text
                        onPress={() => {
                          const u = safeUrl(e.url!);
                          if (u) void RnLinking.openURL(u);
                        }}
                        style={{ color: colors.accentInk, fontSize: 13 }}
                      >
                        {e.url}
                      </Text>
                    ) : null}
                  </View>
                ))
              : null}
          </View>
        ) : null}
      </ScrollView>

      <View style={{ borderTopWidth: 1, borderTopColor: colors.line }}>
        {undoSpec ? (
          <UndoBar
            spec={undoSpec}
            now={now}
            onUndo={() => {
              void act(() => client()!.undo(decisionId));
            }}
            onOpen={() => router.push(`/decision/${decisionId}`)}
          />
        ) : d.status === 'open' && !d.answer && live ? (
          <View style={{ padding: 14, gap: 10, backgroundColor: colors.bg }}>
            {d.allow_other ? (
              showOther ? (
                <View style={{ gap: 8 }}>
                  <TextInput
                    value={otherText}
                    onChangeText={setOtherText}
                    multiline
                    placeholder="What's your answer?"
                    placeholderTextColor={colors.textFaint}
                    style={{
                      backgroundColor: colors.surface,
                      borderColor: colors.lineStrong,
                      borderWidth: 1,
                      borderRadius: 2,
                      color: colors.text,
                      minHeight: 64,
                      padding: 10,
                    }}
                  />
                  <View style={{ flexDirection: 'row', gap: 8, justifyContent: 'flex-end' }}>
                    <Pressable onPress={() => setShowOther(false)} accessibilityRole="button">
                      <Text style={{ color: colors.textDim, fontSize: 14 }}>Cancel</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => {
                        const t = otherText.trim();
                        if (!t) return;
                        void act(() => client()!.answer(decisionId, { otherText: t }));
                        setOtherText('');
                        setShowOther(false);
                      }}
                      disabled={busy || otherText.trim().length === 0}
                      accessibilityRole="button"
                      style={{
                        backgroundColor: colors.accent,
                        paddingHorizontal: 14,
                        paddingVertical: 8,
                        borderRadius: 2,
                        opacity: busy || otherText.trim().length === 0 ? 0.6 : 1,
                      }}
                    >
                      <Text style={{ color: colors.onAccent, fontSize: 14, fontWeight: '700' }}>
                        Send
                      </Text>
                    </Pressable>
                  </View>
                </View>
              ) : (
                <Pressable
                  onPress={() => setShowOther(true)}
                  accessibilityRole="button"
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
                >
                  <PixelIcon name="other" cell={3} color={colors.textDim} />
                  <Text style={{ color: colors.textDim, fontSize: 14, fontWeight: '600' }}>
                    Other answer
                  </Text>
                </Pressable>
              )
            ) : null}
            {d.allow_call ? (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 8,
                  opacity: callOpen ? 1 : 0.5,
                }}
              >
                <PixelIcon
                  name="call"
                  cell={3}
                  color={callOpen ? colors.accentInk : colors.textDim}
                />
                <Text
                  style={{
                    color: callOpen ? colors.text : colors.textDim,
                    fontSize: 14,
                    fontWeight: '600',
                  }}
                >
                  Talk it through
                </Text>
                <Text
                  style={{ color: colors.textFaint, fontSize: 12, flex: 1, textAlign: 'right' }}
                >
                  {callOpen ? 'Call Me arrives in a later update' : (callNote ?? '')}
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}
      </View>
    </View>
  );
}
