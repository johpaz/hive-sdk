export { startGateway } from "./server.ts";
export type { GatewayConfig } from "./server.ts";

// Salida hacia el usuario: la app conecta su ChannelManager con setChannelManager().
export { setChannelManager, getChannelManager, notifyChannel, sendToUserChannel, broadcastNotification, type ChannelSender } from "./channel-notify.ts";
