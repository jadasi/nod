/**
 * The inbox card.
 *
 * Triage, not answering: tags, the glance title, the question, and one
 * status line. No options on the card — an answer from a list row would
 * skip the impact text, and impact-first is the whole point.
 *
 * Emphasis follows the tokens: a card that needs David gets accent corner
 * brackets, an urgent one gets red brackets and a red edge, a repair item
 * gets the amber edge and its own actions.
 */
import { Pressable, View } from 'react-native';
import { tokens } from '@nod/design-tokens';
import type { DecisionView } from '@/api/types.js';
import { answerBanner, cardBanner, formatAge } from '@/lib/format.js';
import { space, useColors } from '@/theme.js';
import { Banner, Button, Panel, T, Tag } from './ui';
import { PixelIcon } from './pixel';

/** The repair actions a problem card offers, by decision status. */
export interface RepairActions {
  onReask?: () => void;
  onRetry?: () => void;
  onRefresh?: () => void;
  onWithdraw?: () => void;
  onDismiss?: () => void;
}

function Tags({ d, answered }: { d: DecisionView; answered: boolean }) {
  const source = [d.source.system, d.source.agent].filter(Boolean).join(' · ');
  const external = d.provenance.kind === 'external';
  return (
    <View style={{ flexDirection: 'row', gap: space[2], flexWrap: 'wrap' }}>
      {d.urgency === 'urgent' ? (
        <Tag tone="urgent" icon="alert">
          Urgent
        </Tag>
      ) : null}
      {answered ? (
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
  );
}

export function DecisionCard({
  d,
  now,
  onPress,
  offline,
  repair,
  busy,
}: {
  d: DecisionView;
  now: number;
  onPress: () => void;
  /** Offline dims the cached card and takes the answer path away. */
  offline?: boolean;
  /** Present on the Attention filter: the repair actions for this problem. */
  repair?: RepairActions;
  busy?: boolean;
}) {
  const colors = useColors();
  const answer = answerBanner(d.answer, now);
  const banner = cardBanner(d, now);
  const answered = !!answer;
  const needsYou = d.status === 'open' && !d.answer;
  const urgent = d.urgency === 'urgent';
  const isRepair = !!repair;

  const tone = isRepair ? 'attention' : urgent ? 'urgent' : needsYou ? 'needsYou' : 'plain';

  const actions = repair
    ? ([
        repair.onReask && { label: 'Re-ask', icon: 'refresh' as const, onPress: repair.onReask },
        repair.onRetry && { label: 'Retry', icon: 'send' as const, onPress: repair.onRetry },
        repair.onRefresh && {
          label: 'Force refresh',
          icon: 'refresh' as const,
          onPress: repair.onRefresh,
        },
        repair.onWithdraw && {
          label: 'Withdraw',
          icon: 'close' as const,
          onPress: repair.onWithdraw,
          danger: true,
        },
        repair.onDismiss && {
          label: 'Dismiss',
          icon: 'check' as const,
          onPress: repair.onDismiss,
        },
      ].filter(Boolean) as {
        label: string;
        icon: 'refresh' | 'send' | 'close' | 'check';
        onPress: () => void;
        danger?: boolean;
      }[])
    : [];

  return (
    <Panel tone={tone} dimmed={offline}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${urgent ? 'Urgent. ' : ''}${d.glance.title}. ${d.glance.question}`}
        style={({ pressed }) => ({
          padding: space[4],
          gap: space[3],
          backgroundColor: pressed ? colors.surfaceRaised : 'transparent',
        })}
      >
        <Tags d={d} answered={answered} />
        <T step="title">{d.glance.title}</T>
        <T step="body" color={colors.textDim} numberOfLines={3}>
          {d.glance.question}
        </T>

        {banner && isRepair ? (
          <Banner kind={banner.kind}>{banner.text}</Banner>
        ) : banner ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
            <PixelIcon
              name={
                banner.kind === 'undo' || banner.kind === 'sending'
                  ? 'send'
                  : banner.kind === 'stale' || banner.kind === 'failed'
                    ? 'stale'
                    : banner.kind === 'held'
                      ? 'clock'
                      : 'check'
              }
              size={tokens.icon.sm + 2}
              color={
                banner.kind === 'undo' || banner.kind === 'sending' || banner.kind === 'done'
                  ? colors.accentInk
                  : banner.kind === 'held'
                    ? colors.amber
                    : colors.red
              }
            />
            <T
              step="small"
              weight="600"
              color={
                banner.kind === 'undo' || banner.kind === 'sending' || banner.kind === 'done'
                  ? colors.accentInk
                  : banner.kind === 'held'
                    ? colors.amber
                    : colors.red
              }
            >
              {banner.text}
            </T>
          </View>
        ) : (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
            <PixelIcon name="clock" size={tokens.icon.sm + 2} color={colors.textFaint} />
            <T step="small" color={colors.textFaint}>
              {`Asked ${formatAge(Math.max(0, (now - new Date(d.created_at).getTime()) / 1000))} ago`}
            </T>
          </View>
        )}
      </Pressable>

      {actions.length > 0 ? (
        <View
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            gap: space[2],
            paddingHorizontal: space[4],
            paddingBottom: space[4],
          }}
        >
          {actions.map((a) => (
            <Button
              key={a.label}
              label={a.label}
              icon={a.icon}
              tone={a.danger ? 'danger' : 'outline'}
              compact
              disabled={busy}
              onPress={a.onPress}
            />
          ))}
        </View>
      ) : null}
    </Panel>
  );
}
