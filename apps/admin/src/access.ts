export default function access(
  initialState: { authenticated?: boolean; error?: string } | undefined,
) {
  return { canAdmin: !!initialState?.authenticated || !!initialState?.error };
}
