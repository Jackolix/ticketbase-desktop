export interface OpenWebUISettings {
  baseUrl: string;
  apiKey: string;
  defaultModel: string;
  enabled: boolean;
}

export interface OpenWebUIModel {
  id: string;
  name: string;
  object: string;
  created: number;
  owned_by: string;
}

export interface OpenWebUIChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface OpenWebUIChatRequest {
  model: string;
  messages: OpenWebUIChatMessage[];
  stream?: boolean;
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
}

export interface OpenWebUIChatResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: {
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }[];
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface TicketSummary {
  summary: string;
  priority_suggestion?: 'low' | 'medium' | 'high' | 'urgent';
  category_suggestion?: string;
  confidence: number;
}

export interface ResponseSuggestion {
  suggestion: string;
  tone: 'professional' | 'friendly' | 'technical';
  confidence: number;
}