export interface SourceRef {
  system: string;
  ref: string;
  url?: string | undefined;
}

export interface SourceState {
  /** The source's current precondition token (revision, SHA, last-message id, ...). */
  fingerprint: string;
  /** True when the source shows the question is already settled (e.g. approved elsewhere). */
  resolved: boolean;
}

export interface DeliveryInput {
  decisionId: string;
  source: SourceRef;
  optionId: string | null;
  otherText: string | null;
  /** Derived from decision id and answer version; the source must apply it once. */
  idempotencyKey: string;
  /** The fingerprint the answer was checked against just before sending. */
  fingerprint: string;
}

/**
 * How Nod reads from and writes to one kind of source. Nod never trusts its own copy:
 * it stores a pointer and a fingerprint, and re-reads through this interface.
 */
export interface SourceAdapter {
  /** Current state of the source, or null when the source can't be read by Nod. */
  fingerprint(source: SourceRef): Promise<SourceState | null>;
  /** Applies the answer at the source. Throws if the source refuses or is unreachable. */
  deliver(input: DeliveryInput): Promise<void>;
}

/**
 * For agents that poll `await_decision` and act themselves. Nod can't read their source,
 * so the agent does the compare-and-swap using the fingerprint `await_decision` returns.
 */
export const passiveAdapter: SourceAdapter = {
  fingerprint: () => Promise.resolve(null),
  deliver: () => Promise.resolve(),
};

export class AdapterRegistry {
  private readonly adapters = new Map<string, SourceAdapter>();

  register(system: string, adapter: SourceAdapter): this {
    this.adapters.set(system, adapter);
    return this;
  }

  get(system: string): SourceAdapter {
    return this.adapters.get(system) ?? passiveAdapter;
  }
}
