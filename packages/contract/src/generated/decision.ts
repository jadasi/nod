/* Generated from decision.schema.json. Do not edit. */

/**
 * What an agent submits via request_decision. Nod adds id, status, timestamps, classification and audit fields on its side. Field limits on `glance` exist so cards fit the Even G2 576x288 display.
 */
export interface DecisionRequest {
  /**
   * Agent-chosen key; resubmitting the same key returns the existing decision instead of creating a duplicate.
   */
  idempotency_key?: string;
  source: {
    system: "paperclip" | "claude_code" | "hermes" | "email_triage" | "github" | "railway" | "other";
    /**
     * Source-native identifier, e.g. Paperclip issue/approval id, PR number, email thread id.
     */
    ref: string;
    url?: string;
    /**
     * Work area, e.g. web-app, docs-site, billing.
     */
    project?: string;
    /**
     * Name of the requesting agent.
     */
    agent?: string;
  };
  provenance: {
    /**
     * external = triggered by input from outside David's systems (e.g. an inbound email).
     */
    kind: "internal" | "external";
    /**
     * e.g. sender address for an inbound email.
     */
    origin?: string;
  };
  glance: {
    title: string;
    question: string;
  };
  /**
   * Plain-language effect on people (end users, clients, David). Leads the detail view. No technical jargon.
   */
  impact: string;
  /**
   * @minItems 2
   * @maxItems 4
   */
  options:
    | [
        {
          id: string;
          label: string;
          /**
           * What happens for people if chosen.
           */
          outcome: string;
          reversible: boolean;
          /**
           * True if choosing this performs any external write (send, deploy, delete, spend, modify).
           */
          writes: boolean;
        },
        {
          id: string;
          label: string;
          /**
           * What happens for people if chosen.
           */
          outcome: string;
          reversible: boolean;
          /**
           * True if choosing this performs any external write (send, deploy, delete, spend, modify).
           */
          writes: boolean;
        }
      ]
    | [
        {
          id: string;
          label: string;
          /**
           * What happens for people if chosen.
           */
          outcome: string;
          reversible: boolean;
          /**
           * True if choosing this performs any external write (send, deploy, delete, spend, modify).
           */
          writes: boolean;
        },
        {
          id: string;
          label: string;
          /**
           * What happens for people if chosen.
           */
          outcome: string;
          reversible: boolean;
          /**
           * True if choosing this performs any external write (send, deploy, delete, spend, modify).
           */
          writes: boolean;
        },
        {
          id: string;
          label: string;
          /**
           * What happens for people if chosen.
           */
          outcome: string;
          reversible: boolean;
          /**
           * True if choosing this performs any external write (send, deploy, delete, spend, modify).
           */
          writes: boolean;
        }
      ]
    | [
        {
          id: string;
          label: string;
          /**
           * What happens for people if chosen.
           */
          outcome: string;
          reversible: boolean;
          /**
           * True if choosing this performs any external write (send, deploy, delete, spend, modify).
           */
          writes: boolean;
        },
        {
          id: string;
          label: string;
          /**
           * What happens for people if chosen.
           */
          outcome: string;
          reversible: boolean;
          /**
           * True if choosing this performs any external write (send, deploy, delete, spend, modify).
           */
          writes: boolean;
        },
        {
          id: string;
          label: string;
          /**
           * What happens for people if chosen.
           */
          outcome: string;
          reversible: boolean;
          /**
           * True if choosing this performs any external write (send, deploy, delete, spend, modify).
           */
          writes: boolean;
        },
        {
          id: string;
          label: string;
          /**
           * What happens for people if chosen.
           */
          outcome: string;
          reversible: boolean;
          /**
           * True if choosing this performs any external write (send, deploy, delete, spend, modify).
           */
          writes: boolean;
        }
      ];
  /**
   * Option id the agent recommends.
   */
  recommended: string;
  confidence?: number;
  /**
   * What the agent will do if unanswered. Deadline pauses outside open hours unless urgent.
   */
  default?: {
    option: string;
    deadline: string;
  };
  urgency?: "normal" | "urgent";
  allow_other?: boolean;
  allow_call?: boolean;
  /**
   * Opaque precondition token from the source (revision, branch SHA, thread last-message id, deploy id). Nod re-reads the source and compares before writing an answer.
   */
  fingerprint: string;
  /**
   * Lock keys this decision would act on, e.g. env:staging, email-thread:abc123, branch:repo/name.
   */
  resources?: string[];
  evidence?: {
    kind: "link" | "image" | "preview" | "diff_summary" | "text";
    label: string;
    url?: string;
    text?: string;
  }[];
  /**
   * What the agent already tried or researched. Used to brief Call Me.
   */
  tried?: string;
  /**
   * Request expires unless the agent heartbeats.
   */
  ttl_seconds: number;
}
