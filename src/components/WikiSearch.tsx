import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, ArrowLeft, BookOpen, FolderTree, RefreshCw, Search, X } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/PageHeader';
import { apiClient } from '@/lib/api';
import { cache } from '@/lib/cache';
import { parseTicketDate } from '@/lib/ticketDate';

interface WikiArticle {
  id: number;
  title: string;
  content: string;
  category: string;
  folder: string;
  writer?: { name: string; email: string };
  created_at: string;
  updated_at: string;
}

const CACHE_KEY = 'wiki_articles';
const CACHE_TTL = 15 * 60 * 1000;

/**
 * Knowledge base.
 *
 * Read-only: getWikiData is the only wiki endpoint the API exposes, so articles
 * cannot be created or edited from here — that lives in the web UI.
 *
 * The whole set is fetched once and filtered locally, which is fine because it
 * is small and rarely changes; the cache keeps it off the network between
 * visits.
 */
export function WikiSearch() {
  const [articles, setArticles] = useState<WikiArticle[]>([]);
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [activeFolder, setActiveFolder] = useState<string | null>(null);
  const [selected, setSelected] = useState<WikiArticle | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query), 220);
    return () => clearTimeout(timer);
  }, [query]);

  const fetchWikiData = useCallback(async (forceRefresh = false) => {
    if (!forceRefresh) {
      const cached = cache.get<WikiArticle[]>(CACHE_KEY);
      if (cached) {
        setArticles(cached);
        setIsLoading(false);
        return;
      }
    }

    setIsLoading(true);
    setError(null);
    try {
      const response = await apiClient.getWikiData();
      const data = (response.wikiData ?? []) as WikiArticle[];
      setArticles(data);
      cache.set(CACHE_KEY, data, CACHE_TTL);
    } catch (err) {
      console.error('Failed to load the knowledge base:', err);
      setError('Die Wissensdatenbank konnte nicht geladen werden.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchWikiData();
  }, [fetchWikiData]);

  const folders = useMemo(() => {
    const counts = new Map<string, number>();
    for (const article of articles) {
      const folder = article.folder?.trim() || 'Ohne Ordner';
      counts.set(folder, (counts.get(folder) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [articles]);

  const results = useMemo(() => {
    const needle = debounced.trim().toLowerCase();
    return articles.filter((article) => {
      const folder = article.folder?.trim() || 'Ohne Ordner';
      if (activeFolder && folder !== activeFolder) return false;
      if (!needle) return true;

      return [article.title, article.content, article.category, article.folder]
        .filter(Boolean)
        .some((field) => field.toLowerCase().includes(needle));
    });
  }, [articles, debounced, activeFolder]);

  if (selected) {
    return <ArticleView article={selected} onBack={() => setSelected(null)} />;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <PageHeader
        title="Wissensdatenbank"
        description={`${articles.length} Artikel — nur lesend, Bearbeiten erfolgt im Web-Interface.`}
        icon={BookOpen}
      >
        <Button
          variant="outline"
          size="sm"
          onClick={() => void fetchWikiData(true)}
          disabled={isLoading}
          className="h-8 gap-1.5 text-xs"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          Aktualisieren
        </Button>
      </PageHeader>

      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Artikel durchsuchen…"
          className="h-9 pl-8 pr-8 text-xs"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            aria-label="Suche leeren"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {folders.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          <FolderChip
            label="Alle"
            count={articles.length}
            active={activeFolder === null}
            onClick={() => setActiveFolder(null)}
          />
          {folders.map(([folder, count]) => (
            <FolderChip
              key={folder}
              label={folder}
              count={count}
              active={activeFolder === folder}
              onClick={() => setActiveFolder(activeFolder === folder ? null : folder)}
            />
          ))}
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-tone-danger-soft px-3 py-2 text-xs text-tone-danger">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span className="flex-1">{error}</span>
          <button type="button" onClick={() => void fetchWikiData(true)} className="underline">
            Erneut versuchen
          </button>
        </div>
      )}

      <Card className="min-h-0 flex-1 overflow-auto py-0">
        {isLoading ? (
          <div className="divide-y">
            {Array.from({ length: 8 }, (_, i) => (
              <div key={i} className="animate-pulse space-y-1.5 px-3 py-2.5">
                <div className="h-3 w-1/3 rounded bg-muted" />
                <div className="h-2 w-2/3 rounded bg-muted" />
              </div>
            ))}
          </div>
        ) : results.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-3 py-12 text-center">
            <FolderTree className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium">Keine Artikel gefunden</p>
            <p className="text-xs text-muted-foreground">
              {debounced ? 'Andere Suchbegriffe versuchen.' : 'Die Wissensdatenbank ist leer.'}
            </p>
          </div>
        ) : (
          <ul className="divide-y">
            {results.map((article) => (
              <li key={article.id}>
                <button
                  type="button"
                  onClick={() => setSelected(article)}
                  className="w-full px-3 py-2.5 text-left hover:bg-accent/50 focus:bg-accent/50 focus:outline-none"
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{article.title}</span>
                      <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                        {excerpt(article.content, debounced)}
                      </span>
                    </span>
                    {article.folder && (
                      <Badge variant="outline" className="shrink-0 text-[10px]">
                        {article.folder}
                      </Badge>
                    )}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <p className="text-[11px] text-muted-foreground">
        {results.length} von {articles.length} Artikeln
      </p>
    </div>
  );
}

function FolderChip({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs transition-colors',
        active ? 'bg-foreground text-background' : 'bg-secondary hover:bg-accent',
      ].join(' ')}
    >
      {label}
      <span className="font-mono text-[10px] tabular-nums opacity-70">{count}</span>
    </button>
  );
}

function ArticleView({ article, onBack }: { article: WikiArticle; onBack: () => void }) {
  const updated = parseTicketDate(article.updated_at);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex items-start gap-3">
        <Button variant="outline" size="icon" onClick={onBack} aria-label="Zurück zur Übersicht">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-semibold">{article.title}</h1>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            {article.folder && <span>{article.folder}</span>}
            {article.category && <span>· {article.category}</span>}
            {article.writer?.name && <span>· {article.writer.name}</span>}
            {updated && <span>· {updated.toLocaleDateString()}</span>}
          </p>
        </div>
      </div>

      <Card className="min-h-0 flex-1 overflow-auto p-5">
        {/* Article bodies are HTML from the web editor. Rendering them as text
            keeps untrusted markup out of the app; the trade-off is that
            formatting is lost, which is preferable to injecting it. */}
        <div className="prose-sm max-w-[70ch] whitespace-pre-wrap text-sm leading-relaxed">
          {stripHtml(article.content)}
        </div>
      </Card>
    </div>
  );
}

/** First match in context, so search results show why they matched. */
function excerpt(content: string, needle: string): string {
  const text = stripHtml(content).replace(/\s+/g, ' ').trim();
  if (!needle) return text.slice(0, 140);

  const at = text.toLowerCase().indexOf(needle.trim().toLowerCase());
  if (at < 0) return text.slice(0, 140);

  const from = Math.max(0, at - 40);
  return `${from > 0 ? '…' : ''}${text.slice(from, from + 140)}`;
}

function stripHtml(html: string): string {
  const el = document.createElement('div');
  el.innerHTML = html ?? '';
  return el.textContent || el.innerText || '';
}
