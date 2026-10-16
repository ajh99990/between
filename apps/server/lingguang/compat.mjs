// Official SIWC contract, not the ChatGPT backend-api/Codex private route.
// Stateless: Qwen remains the owner of history, tool execution and retries.
export class CompatibilityError extends Error {}

const OMIT = ['background', 'conversation', 'max_output_tokens', 'max_tool_calls',
  'metadata', 'moderation', 'multi_agent', 'prompt', 'prompt_cache_retention',
  'safety_identifier', 'temperature', 'top_logprobs', 'top_p', 'truncation', 'user'];

function adaptTools(tools) {
  if (!Array.isArray(tools)) throw new CompatibilityError('tools must be an array');
  for (const tool of tools) {
    if (!tool || !['function', 'custom', 'namespace'].includes(tool.type)) {
      throw new CompatibilityError('Only client-side function/custom tools and namespaces are supported');
    }
    if (tool.type === 'namespace') adaptTools(tool.tools);
    if (typeof tool.name !== 'string' || !tool.name) throw new CompatibilityError('Tool name is required');
    // Responses otherwise attempts strict schema normalization, making Qwen's
    // optional parameters required. Preserve explicit choices and the schema.
    if (tool.type === 'function' && !Object.hasOwn(tool, 'strict')) tool.strict = false;
  }
}

export function adaptRequest(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new CompatibilityError('Expected a JSON object');
  // Never silently discard server-held history or change the client's response mode.
  if (value.previous_response_id != null) throw new CompatibilityError('Send full input history, not previous_response_id');
  if (value.conversation != null || value.prompt != null || value.multi_agent != null || value.background === true) {
    throw new CompatibilityError('Server-owned context, saved prompts and background execution are not supported');
  }
  if (value.stream !== true) throw new CompatibilityError('This adapter requires stream:true');
  if (value.store === true) throw new CompatibilityError('This adapter requires store:false');
  if (!Array.isArray(value.input)) throw new CompatibilityError('input must be an array');
  const result = structuredClone(value);
  const omittedFields = OMIT.filter(key => Object.hasOwn(result, key));
  for (const key of OMIT) delete result[key];
  delete result.previous_response_id;
  result.store = false;
  for (const item of result.input) {
    // Role conversion keeps content and order; it does not invent a new prompt.
    if (item?.role === 'system') item.role = 'developer';
    if (item?.type === 'additional_tools') {
      if (item.role !== 'developer') throw new CompatibilityError('additional_tools requires developer role');
      adaptTools(item.tools);
    }
  }
  if (result.tools != null) {
    adaptTools(result.tools);
    if (result.tools.length) result.input.unshift({ type: 'additional_tools', role: 'developer', tools: result.tools });
    delete result.tools;
  }
  // tool_choice (including forced selection) and call IDs are intentionally untouched.
  return { body: result, omittedFields };
}

// Observe SSE framing without rewriting model output, tool calls or terminal events.
// Accept missing/mislabeled Content-Type only after an actual Responses event is parsed.
export class ResponsesFrames {
  buffer = '';
  decoder = new TextDecoder();
  seenEvent = false;
  terminal = false;
  terminalType;
  push(bytes, final = false) {
    this.buffer += this.decoder.decode(bytes, { stream: !final });
    // A frame can contain a full final response; cap one frame, not the whole stream.
    if (this.buffer.length > 8 * 1024 * 1024) throw new Error('SSE frame too large');
    let match;
    while ((match = /\r?\n\r?\n/.exec(this.buffer))) {
      const frame = this.buffer.slice(0, match.index);
      this.buffer = this.buffer.slice(match.index + match[0].length);
      const lines = frame.split(/\r?\n/);
      const data = lines.filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
      if (!data) continue;
      if (data === '[DONE]') continue; // Not proof of response.completed.
      const event = JSON.parse(data);
      if (typeof event.type !== 'string' || !(event.type.startsWith('response.') || event.type === 'error')) {
        throw new Error('Not a Responses SSE event');
      }
      this.seenEvent = true;
      if (['response.completed', 'response.failed', 'response.incomplete', 'error'].includes(event.type)) {
        this.terminal = true;
        this.terminalType = event.type;
      }
    }
    if (final && this.buffer.trim()) throw new Error('Truncated SSE frame');
  }
}
