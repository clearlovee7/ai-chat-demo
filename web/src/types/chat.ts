//引用来源片段
export interface RefItem {
  text: string;
  score: number;
}

//一条消息
export interface ChatMessage {
  role: 'user' | 'assistant',
  content: string,
  thinking?: string,
  references?: RefItem[],
  isError?: boolean,
}

// SSE 流里每一帧的 JSON 结构
export interface SseChunk {
  error?: string
  type?: 'references'
  items?: RefItem[]
  choices?: Array<{
    delta?: {
      content?: string
      reasoning_content?: string
    }
  }>
}