/**
 * Rate limit en memoria por jid de cliente final (WHATSAPP-AGENT-VERTICALS F1 §2.3).
 * Freno de mano contra ráfagas/loops — la quota contable vive en quota-validator.
 */
export class JidRateLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly maxPerWindow = 8,
    private readonly windowMs = 60_000
  ) {}

  /** true = este mensaje excede el máximo por ventana y debe ignorarse. */
  isLimited(jid: string, nowMs: number): boolean {
    const windowStart = nowMs - this.windowMs;
    const recent = (this.hits.get(jid) ?? []).filter((ts) => ts > windowStart);
    if (recent.length >= this.maxPerWindow) {
      this.hits.set(jid, recent);
      return true;
    }
    recent.push(nowMs);
    this.hits.set(jid, recent);
    return false;
  }
}
