/**
 * PROVISIONAL UI — functional placeholder, owned by Designer (BYT-753).
 * The inbox card: tags, glance title, question and the live status line.
 * No options on the card (the list is for triage; the detail is where David
 * answers).
 */
import type { DecisionView } from '@/api/types.js';
import { answerBanner, cardBanner, formatAge } from '@/lib/format.js';
import { useColors } from '@/theme.js';
import { Pressable, Text, View } from 'react-native';
import { Tag } from './bits';

export function DecisionCard({
  d,
  now,
  onPress,
}: {
  d: DecisionView;
  now: number;
  onPress: () => void;
}) {
  const colors = useColors();
  const urgent = d.urgency === 'urgent';
  const external = d.provenance.kind === 'external';
  const banner = cardBanner(d, now);
  const answer = answerBanner(d.answer, now);
  const source = [d.source.system, d.source.agent].filter(Boolean).join(' · ');

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={{
        backgroundColor: colors.surface,
        borderColor: urgent ? colors.red : colors.line,
        borderWidth: 1,
        borderRadius: 2,
        borderLeftWidth: urgent ? 3 : 1,
        borderLeftColor: urgent ? colors.red : colors.line,
        padding: 14,
        gap: 6,
      }}
    >
      <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
        {urgent ? <Tag tone="urgent">Urgent</Tag> : null}
        {external ? <Tag tone="external">From external</Tag> : null}
        {answer ? <Tag tone="accent">Answered</Tag> : null}
        {source ? <Tag tone="dim">{source}</Tag> : null}
      </View>
      <Text style={{ color: colors.text, fontSize: 17, fontWeight: '700' }}>{d.glance.title}</Text>
      <Text style={{ color: colors.textDim, fontSize: 15 }} numberOfLines={2}>
        {d.glance.question}
      </Text>
      {banner ? (
        <Text
          style={{
            color:
              banner.kind === 'undo' || banner.kind === 'sending'
                ? colors.accentInk
                : banner.kind === 'stale' || banner.kind === 'failed'
                  ? colors.red
                  : banner.kind === 'held'
                    ? colors.amber
                    : colors.textDim,
            fontSize: 13,
          }}
        >
          {banner.text}
        </Text>
      ) : (
        <Text style={{ color: colors.textFaint, fontSize: 12 }}>
          {`asked ${formatAge(Math.max(0, (now - new Date(d.created_at).getTime()) / 1000))} ago`}
        </Text>
      )}
    </Pressable>
  );
}
