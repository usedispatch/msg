import { ParsedMessageData, MessageData } from "./mailbox";

export type SolanartMessage = {
  message: {
    event: string;
    subject: string;
    message: string;
    timestamp: string;
  };
  id: number;
  senderName: string;
  ns: "solanart";
};

export const convertSolanartToDispatchMessage = (messageData: ParsedMessageData): MessageData => {
  if (messageData.ns !== "solanart") {
    throw new Error("Cannot parse message as a solanart native message if ns not solanart");
  }
  const solanartMessage = messageData as any as SolanartMessage;
  return {
    subj: solanartMessage.message.subject,
    body: solanartMessage.message.message,
    ts: new Date(1000 * +solanartMessage.message.timestamp),
  };
}
