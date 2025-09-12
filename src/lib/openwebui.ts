import type { 
  OpenWebUISettings,
  OpenWebUIModel,
  OpenWebUIChatRequest,
  OpenWebUIChatResponse,
  TicketSummary,
  ResponseSuggestion
} from '@/types/openwebui';

class OpenWebUIClient {
  private settings: OpenWebUISettings | null = null;

  constructor() {
    this.loadSettings();
  }

  private loadSettings() {
    const stored = localStorage.getItem('openwebui_settings');
    if (stored) {
      this.settings = JSON.parse(stored);
    }
  }

  private saveSettings(settings: OpenWebUISettings) {
    this.settings = settings;
    localStorage.setItem('openwebui_settings', JSON.stringify(settings));
  }

  updateSettings(settings: OpenWebUISettings) {
    this.saveSettings(settings);
  }

  getSettings(): OpenWebUISettings | null {
    return this.settings;
  }

  isConfigured(): boolean {
    // Always reload settings to get the latest values
    this.loadSettings();
    return !!(this.settings?.baseUrl && this.settings?.apiKey && this.settings?.enabled);
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    // Always reload settings to get the latest values
    this.loadSettings();
    
    if (!this.settings?.baseUrl || !this.settings?.apiKey) {
      throw new Error('OpenWebUI not configured. Please check your settings.');
    }

    const url = `${this.settings.baseUrl.replace(/\/$/, '')}${endpoint}`;
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.settings.apiKey}`,
      ...(options.headers as Record<string, string>),
    };

    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenWebUI API error: ${response.status} - ${error}`);
    }

    return response.json();
  }

  async getModels(): Promise<OpenWebUIModel[]> {
    if (!this.isConfigured()) {
      throw new Error('OpenWebUI not configured');
    }

    const response = await this.request<{ data: OpenWebUIModel[] }>('/api/v1/models');
    return response.data;
  }

  async chat(request: OpenWebUIChatRequest): Promise<OpenWebUIChatResponse> {
    if (!this.isConfigured()) {
      throw new Error('OpenWebUI not configured');
    }

    console.log('Chat request with model:', request.model);
    console.log('Current settings:', this.settings);

    return this.request<OpenWebUIChatResponse>('/api/v1/chat/completions', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }

  async summarizeTicket(
    ticketDescription: string,
    ticketHistory?: string[]
  ): Promise<TicketSummary> {
    if (!this.isConfigured()) {
      throw new Error('OpenWebUI not configured');
    }

    const historyText = ticketHistory?.length 
      ? `\n\nTicket History:\n${ticketHistory.join('\n')}`
      : '';

    const prompt = `Analyze this IT support ticket and provide a summary with suggestions.

Ticket Description: ${ticketDescription}${historyText}

Please respond in JSON format with:
{
  "summary": "Brief summary of the issue",
  "priority_suggestion": "low|medium|high|urgent",
  "category_suggestion": "Category name",
  "confidence": 0.0-1.0
}`;

    const response = await this.chat({
      model: this.settings!.defaultModel,
      messages: [
        {
          role: 'system',
          content: 'You are an AI assistant specialized in IT support ticket analysis. Respond only with valid JSON.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.3,
    });

    try {
      let content = response.choices[0].message.content;
      
      // Remove markdown code blocks if present
      const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (codeBlockMatch) {
        content = codeBlockMatch[1];
      }
      
      return JSON.parse(content);
    } catch (error) {
      console.error('Failed to parse AI response:', response.choices[0].message.content);
      throw new Error('Failed to parse AI response');
    }
  }

  async suggestResponse(
    ticketDescription: string,
    ticketHistory: string[],
    context?: string
  ): Promise<ResponseSuggestion> {
    if (!this.isConfigured()) {
      throw new Error('OpenWebUI not configured');
    }

    const historyText = ticketHistory.length 
      ? `\n\nTicket History:\n${ticketHistory.join('\n')}`
      : '';

    const contextText = context ? `\n\nAdditional Context: ${context}` : '';

    const prompt = `Generate a professional response suggestion for this IT support ticket.

Ticket Description: ${ticketDescription}${historyText}${contextText}

Please respond in JSON format with:
{
  "suggestion": "Suggested response text",
  "tone": "professional|friendly|technical",
  "confidence": 0.0-1.0
}`;

    const response = await this.chat({
      model: this.settings!.defaultModel,
      messages: [
        {
          role: 'system',
          content: 'You are an experienced IT support specialist. Generate helpful, professional responses to customer tickets. Respond only with valid JSON.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.5,
    });

    try {
      let content = response.choices[0].message.content;
      
      // Remove markdown code blocks if present
      const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (codeBlockMatch) {
        content = codeBlockMatch[1];
      }
      
      return JSON.parse(content);
    } catch (error) {
      console.error('Failed to parse AI response:', response.choices[0].message.content);
      throw new Error('Failed to parse AI response');
    }
  }

  async categorizeTicket(ticketDescription: string): Promise<{
    category: string;
    priority: 'low' | 'medium' | 'high' | 'urgent';
    confidence: number;
  }> {
    if (!this.isConfigured()) {
      throw new Error('OpenWebUI not configured');
    }

    const prompt = `Categorize this IT support ticket and suggest priority.

Ticket Description: ${ticketDescription}

Please respond in JSON format with:
{
  "category": "Category name (e.g., Hardware, Software, Network, Security, etc.)",
  "priority": "low|medium|high|urgent",
  "confidence": 0.0-1.0
}`;

    const response = await this.chat({
      model: this.settings!.defaultModel,
      messages: [
        {
          role: 'system',
          content: 'You are an IT support manager who categorizes and prioritizes tickets. Respond only with valid JSON.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.2,
    });

    try {
      let content = response.choices[0].message.content;
      
      // Remove markdown code blocks if present
      const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (codeBlockMatch) {
        content = codeBlockMatch[1];
      }
      
      return JSON.parse(content);
    } catch (error) {
      console.error('Failed to parse AI response:', response.choices[0].message.content);
      throw new Error('Failed to parse AI response');
    }
  }

  async improveText(originalText: string, context?: string): Promise<{
    improvedText: string;
    tone: 'professional' | 'friendly' | 'technical';
    changes: string[];
  }> {
    if (!this.isConfigured()) {
      throw new Error('OpenWebUI not configured');
    }

    const contextText = context ? `\n\nContext: ${context}` : '';

    const prompt = `Please improve the following text to make it more professional and clear while maintaining its original meaning. This is for an IT support ticket history entry.

Original text: "${originalText}"${contextText}

Please respond in JSON format with:
{
  "improvedText": "The professionally rewritten text",
  "tone": "professional|friendly|technical",
  "changes": ["list of key improvements made"]
}

Guidelines:
- Keep the same meaning and important details
- Use professional IT support language
- Fix grammar and spelling
- Improve clarity and structure
- Keep it concise but complete`;

    const response = await this.chat({
      model: this.settings!.defaultModel,
      messages: [
        {
          role: 'system',
          content: 'You are a professional editor specializing in IT support communication. Help improve text while maintaining its original meaning and technical accuracy.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.3,
    });

    try {
      let content = response.choices[0].message.content;
      
      // Remove markdown code blocks if present
      const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (codeBlockMatch) {
        content = codeBlockMatch[1];
      }
      
      return JSON.parse(content);
    } catch (error) {
      console.error('Failed to parse AI response:', response.choices[0].message.content);
      throw new Error('Failed to parse AI response');
    }
  }
}

export const openWebUIClient = new OpenWebUIClient();