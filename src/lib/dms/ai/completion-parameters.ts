/** GPT-6 reasoning models reject legacy sampling controls. Keep older requests unchanged. */
export function dmsCompletionParameters(model: string, outputTokens: number, temperature: number) {
  if (/^gpt-6(?:\.|-)/i.test(model)) {
    return {
      max_completion_tokens: Math.max(outputTokens, 4096),
      reasoning_effort: "low",
    };
  }
  return { max_tokens: outputTokens, temperature };
}
