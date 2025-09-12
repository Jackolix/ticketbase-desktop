import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Textarea } from '@/components/ui/textarea';
import { openWebUIClient } from '@/lib/openwebui';
import { Brain, Loader2, Lightbulb, MessageSquare, AlertCircle, CheckCircle, Sparkles, Wand2 } from 'lucide-react';

interface TicketAIAssistantProps {
  ticketDescription?: string;
  ticketHistory?: string[];
  onSuggestionAccept?: (suggestion: string) => void;
  onCategoryAccept?: (category: string, priority: string) => void;
  currentText?: string;
  onTextImprove?: (improvedText: string) => void;
  className?: string;
}

export function TicketAIAssistant({ 
  ticketDescription = '',
  ticketHistory = [],
  onSuggestionAccept,
  onCategoryAccept,
  currentText,
  onTextImprove,
  className 
}: TicketAIAssistantProps) {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isGeneratingResponse, setIsGeneratingResponse] = useState(false);
  const [isImprovingText, setIsImprovingText] = useState(false);
  const [summary, setSummary] = useState<{
    summary: string;
    priority_suggestion?: 'low' | 'medium' | 'high' | 'urgent';
    category_suggestion?: string;
    confidence: number;
  } | null>(null);
  const [responseSuggestion, setResponseSuggestion] = useState<{
    suggestion: string;
    tone: 'professional' | 'friendly' | 'technical';
    confidence: number;
  } | null>(null);
  const [textImprovement, setTextImprovement] = useState<{
    improvedText: string;
    tone: 'professional' | 'friendly' | 'technical';
    changes: string[];
  } | null>(null);
  const [error, setError] = useState<string>('');
  const [customPrompt, setCustomPrompt] = useState('');

  const analyzeTicket = async () => {
    if (!ticketDescription.trim()) {
      setError('Please provide a ticket description');
      return;
    }

    if (!openWebUIClient.isConfigured()) {
      setError('AI Assistant is not configured. Please check your settings.');
      return;
    }

    setIsAnalyzing(true);
    setError('');
    setSummary(null);

    try {
      const result = await openWebUIClient.summarizeTicket(ticketDescription, ticketHistory);
      setSummary(result);
    } catch (error) {
      setError(`Analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const generateResponse = async () => {
    if (!ticketDescription.trim()) {
      setError('Please provide a ticket description');
      return;
    }

    if (!openWebUIClient.isConfigured()) {
      setError('AI Assistant is not configured. Please check your settings.');
      return;
    }

    setIsGeneratingResponse(true);
    setError('');
    setResponseSuggestion(null);

    try {
      const result = await openWebUIClient.suggestResponse(
        ticketDescription, 
        ticketHistory, 
        customPrompt || undefined
      );
      setResponseSuggestion(result);
    } catch (error) {
      setError(`Response generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsGeneratingResponse(false);
    }
  };

  const improveText = async () => {
    if (!currentText?.trim()) {
      setError('Please provide text to improve');
      return;
    }

    if (!openWebUIClient.isConfigured()) {
      setError('AI Assistant is not configured. Please check your settings.');
      return;
    }

    setIsImprovingText(true);
    setError('');
    setTextImprovement(null);

    try {
      const result = await openWebUIClient.improveText(
        currentText,
        `Ticket: ${ticketDescription.substring(0, 200)}...`
      );
      setTextImprovement(result);
    } catch (error) {
      setError(`Text improvement failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsImprovingText(false);
    }
  };

  const handleAcceptSummary = () => {
    if (summary && onCategoryAccept) {
      onCategoryAccept(
        summary.category_suggestion || 'General',
        summary.priority_suggestion || 'medium'
      );
    }
  };

  const handleAcceptResponse = () => {
    if (responseSuggestion && onSuggestionAccept) {
      onSuggestionAccept(responseSuggestion.suggestion);
    }
  };

  const handleAcceptImprovedText = () => {
    if (textImprovement && onTextImprove) {
      onTextImprove(textImprovement.improvedText);
    }
  };

  if (!openWebUIClient.isConfigured()) {
    return (
      <Card className={className}>
        <CardContent className="pt-6">
          <Alert>
            <Brain className="h-4 w-4" />
            <AlertDescription>
              AI Assistant is not configured. Please configure your OpenWebUI settings to use AI features.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Brain className="h-5 w-5 text-purple-600" />
          AI Assistant
          <Badge variant="secondary" className="ml-auto">
            <Sparkles className="w-3 h-3 mr-1" />
            Powered by AI
          </Badge>
        </CardTitle>
        <CardDescription>
          Get AI-powered insights and suggestions for your tickets
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <Button
            onClick={analyzeTicket}
            disabled={isAnalyzing || !ticketDescription.trim()}
            variant="outline"
            className="w-full"
          >
            {isAnalyzing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Analyzing...
              </>
            ) : (
              <>
                <Lightbulb className="mr-2 h-4 w-4" />
                Analyze Ticket
              </>
            )}
          </Button>

          <Button
            onClick={generateResponse}
            disabled={isGeneratingResponse || !ticketDescription.trim()}
            variant="outline"
            className="w-full"
          >
            {isGeneratingResponse ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <MessageSquare className="mr-2 h-4 w-4" />
                Suggest Response
              </>
            )}
          </Button>
        </div>

        {/* Polish Text Feature */}
        {currentText && onTextImprove && (
          <div className="pt-4 border-t">
            <Button
              onClick={improveText}
              disabled={isImprovingText || !currentText.trim()}
              variant="outline"
              className="w-full"
            >
              {isImprovingText ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Polishing...
                </>
              ) : (
                <>
                  <Wand2 className="mr-2 h-4 w-4" />
                  Polish Text
                </>
              )}
            </Button>
          </div>
        )}

        {summary && (
          <Alert>
            <CheckCircle className="h-4 w-4" />
            <AlertDescription>
              <div className="space-y-2">
                <div>
                  <strong>Summary:</strong> {summary.summary}
                </div>
                <div className="flex gap-2 flex-wrap">
                  {summary.category_suggestion && (
                    <Badge variant="outline">
                      Category: {summary.category_suggestion}
                    </Badge>
                  )}
                  {summary.priority_suggestion && (
                    <Badge 
                      variant={
                        summary.priority_suggestion === 'urgent' ? 'destructive' : 
                        summary.priority_suggestion === 'high' ? 'default' : 
                        'secondary'
                      }
                    >
                      Priority: {summary.priority_suggestion}
                    </Badge>
                  )}
                  <Badge variant="outline">
                    Confidence: {Math.round(summary.confidence * 100)}%
                  </Badge>
                </div>
                {onCategoryAccept && (
                  <Button size="sm" onClick={handleAcceptSummary} className="mt-2">
                    Apply Suggestions
                  </Button>
                )}
              </div>
            </AlertDescription>
          </Alert>
        )}

        {responseSuggestion && (
          <Alert>
            <MessageSquare className="h-4 w-4" />
            <AlertDescription>
              <div className="space-y-2">
                <div>
                  <strong>Suggested Response:</strong>
                  <div className="mt-2 p-2 bg-muted/50 rounded text-sm">
                    {responseSuggestion.suggestion}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Badge variant="outline">
                    Tone: {responseSuggestion.tone}
                  </Badge>
                  <Badge variant="outline">
                    Confidence: {Math.round(responseSuggestion.confidence * 100)}%
                  </Badge>
                </div>
                {onSuggestionAccept && (
                  <Button size="sm" onClick={handleAcceptResponse} className="mt-2">
                    Use Response
                  </Button>
                )}
              </div>
            </AlertDescription>
          </Alert>
        )}

        {textImprovement && (
          <Alert>
            <Wand2 className="h-4 w-4" />
            <AlertDescription>
              <div className="space-y-2">
                <div>
                  <strong>Improved Text:</strong>
                  <div className="mt-2 p-2 bg-muted/50 rounded text-sm">
                    {textImprovement.improvedText}
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="flex gap-2">
                    <Badge variant="outline">
                      Tone: {textImprovement.tone}
                    </Badge>
                  </div>
                  {textImprovement.changes.length > 0 && (
                    <div>
                      <strong className="text-xs">Key improvements:</strong>
                      <ul className="text-xs text-muted-foreground mt-1 space-y-1">
                        {textImprovement.changes.map((change, index) => (
                          <li key={index}>• {change}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
                {onTextImprove && (
                  <Button size="sm" onClick={handleAcceptImprovedText} className="mt-2">
                    Use Improved Text
                  </Button>
                )}
              </div>
            </AlertDescription>
          </Alert>
        )}

        <div className="space-y-2">
          <label className="text-sm font-medium">Custom Instructions (Optional)</label>
          <Textarea
            placeholder="Add specific instructions for the AI (e.g., 'Be more technical', 'Focus on troubleshooting steps', etc.)"
            value={customPrompt}
            onChange={(e) => setCustomPrompt(e.target.value)}
            rows={2}
          />
        </div>
      </CardContent>
    </Card>
  );
}