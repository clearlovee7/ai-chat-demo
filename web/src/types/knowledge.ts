export type IngestMode = 'append' | 'replace'


export interface IngestResult {
  ok: boolean,
  filename: string,
  chunks: number,
  total: number
}

export interface StoreInfo {
  total: number
}

export interface ApiError {
  error: string
}