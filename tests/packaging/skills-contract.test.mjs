import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { HOST_CONTEXT_SCHEMA_VERSION, SESSION_TOOLS } from '@between/contracts/host';
import { validateSkillSource } from '../../scripts/skills.mjs';

test('skill host-context schema and tool capabilities match public neutral contracts', async () => {
  const { metadata } = await validateSkillSource(fileURLToPath(new URL('../../skills/relationship', import.meta.url)));
  assert.equal(metadata.product_schema, 'between.host-context');
  assert.deepEqual(metadata.product_schema_versions, [HOST_CONTEXT_SCHEMA_VERSION]);
  const tools = [...metadata.required_capabilities, ...metadata.optional_capabilities].map(capability => `mcp__${capability.replace('.', '__')}`).sort();
  assert.deepEqual(tools, [...SESSION_TOOLS].sort());
});
