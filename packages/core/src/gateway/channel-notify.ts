/**
 * Channel Notify — stub for SDK compatibility.
 * In the full harness this sends messages back to channels.
 */

export async function notifyChannel(
  channel: string,
  userId: string,
  message: string,
  opts?: { threadId?: string; metadata?: Record<string, unknown> }
): Promise<void> {
  // TODO: integrate with ChannelManager for full functionality
  console.log(`[channel-notify] ${channel}: ${message}`);
}

export async function sendToUserChannel(
  channel: string,
  userId: string,
  message: string,
  opts?: { threadId?: string; metadata?: Record<string, unknown> }
): Promise<{ ok: boolean; error?: string }> {
  try {
    await notifyChannel(channel, userId, message, opts);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function broadcastNotification(
  channels: string[],
  message: string
): Promise<void> {
  for (const channel of channels) {
    await notifyChannel(channel, "", message);
  }
}
