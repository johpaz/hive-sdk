import { logger } from "../utils/logger.ts";

const log = logger.child("channel-notify");

export async function sendToUserChannel(
	channel: string,
	userId: string,
	message: string,
): Promise<{ ok: boolean; error?: string }> {
	log.info(`[stub] channel=${channel} userId=${userId} msg=${message.substring(0, 80)}`);
	return { ok: true };
}
