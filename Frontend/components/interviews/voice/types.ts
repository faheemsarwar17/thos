/** One line of the live interview transcript. */
export type TranscriptEntry = {
  speaker: "agent" | "user";
  text: string;
  timestamp?: string;
};
