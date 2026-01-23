export interface ReplyTarget {
  messageId: string;
  authorName: string;
  content: string;
  avatar?: {
    src?: string | null;
    name: string;
  };
  isMissing?: boolean;
}
