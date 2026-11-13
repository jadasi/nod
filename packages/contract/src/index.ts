import { Ajv2020 } from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { readFileSync } from 'node:fs';
import type { DecisionRequest } from './generated/decision.js';

export type { DecisionRequest } from './generated/decision.js';

const schema = JSON.parse(
  readFileSync(new URL('../decision.schema.json', import.meta.url), 'utf8'),
) as object;

const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats.default(ajv);
const validateSchema = ajv.compile<DecisionRequest>(schema);

export type Risk = 'low' | 'write';

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  /** Computed risk: `write` if any option has writes: true. Only set when ok. */
  risk?: Risk;
}

/** Schema validation plus cross-field rules the schema cannot express. */
export function validateDecisionRequest(input: unknown): ValidationResult {
  if (!validateSchema(input)) {
    return {
      ok: false,
      errors: (validateSchema.errors ?? []).map((e) => `${e.instancePath || '/'} ${e.message}`),
    };
  }
  const errors: string[] = [];
  const ids = input.options.map((o) => o.id);
  if (new Set(ids).size !== ids.length) errors.push('/options option ids must be unique');
  if (!ids.includes(input.recommended)) errors.push('/recommended must be one of the option ids');
  if (input.default && !ids.includes(input.default.option)) {
    errors.push('/default/option must be one of the option ids');
  }
  if (errors.length) return { ok: false, errors };
  const risk: Risk = input.options.some((o) => o.writes) ? 'write' : 'low';
  return { ok: true, errors: [], risk };
}
