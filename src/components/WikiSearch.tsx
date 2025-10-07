import { useState, useEffect } from 'react';
import { Search, Book, FileText, Loader2, ExternalLink } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { apiClient } from '@/lib/api';

interface WikiArticle {
  id: number;
  title: string;
  content: string;
  category: string;
  folder: string;
  writer?: {
    name: string;
    email: string;
  };
  created_at: string;
  updated_at: string;
}

export function WikiSearch() {
  const [articles, setArticles] = useState<WikiArticle[]>([]);
  const [filteredArticles, setFilteredArticles] = useState<WikiArticle[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [selectedArticle, setSelectedArticle] = useState<WikiArticle | null>(null);

  useEffect(() => {
    fetchWikiData();
  }, []);

  useEffect(() => {
    if (searchQuery.trim() === '') {
      setFilteredArticles(articles);
    } else {
      const query = searchQuery.toLowerCase();
      const filtered = articles.filter(
        article =>
          article.title.toLowerCase().includes(query) ||
          article.content.toLowerCase().includes(query) ||
          article.category.toLowerCase().includes(query) ||
          article.folder.toLowerCase().includes(query)
      );
      setFilteredArticles(filtered);
    }
  }, [searchQuery, articles]);

  const fetchWikiData = async () => {
    setIsLoading(true);
    try {
      const response = await apiClient.getWikiData();
      if (response.status === 'success' && response.wikiData) {
        // Flatten the nested structure: categories -> folders -> articles
        const flattenedArticles: WikiArticle[] = [];

        response.wikiData.forEach((category: any) => {
          const categoryName = category.name || 'Uncategorized';

          if (category.folder && Array.isArray(category.folder)) {
            category.folder.forEach((folder: any) => {
              const folderName = folder.name || 'General';

              if (folder.article && Array.isArray(folder.article)) {
                folder.article.forEach((article: any) => {
                  flattenedArticles.push({
                    id: article.id,
                    title: article.name || 'Untitled',
                    content: article.article || '',
                    category: categoryName,
                    folder: folderName,
                    writer: article.writer,
                    created_at: article.created_at || '',
                    updated_at: article.updated_at || '',
                  });
                });
              }
            });
          }
        });

        setArticles(flattenedArticles);
        setFilteredArticles(flattenedArticles);
      }
    } catch (error) {
      console.error('Failed to fetch wiki data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const highlightText = (text: string, query: string) => {
    if (!query) return text;

    const parts = text.split(new RegExp(`(${query})`, 'gi'));
    return parts.map((part, index) =>
      part.toLowerCase() === query.toLowerCase() ? (
        <mark key={index} className="bg-yellow-200 dark:bg-yellow-800">
          {part}
        </mark>
      ) : (
        part
      )
    );
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <Book className="h-8 w-8" />
            Knowledge Base
          </h1>
          <p className="text-muted-foreground mt-1">
            Search for solutions, documentation, and guides
          </p>
        </div>
        <Button variant="outline" onClick={fetchWikiData}>
          <Search className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Search Articles</CardTitle>
          <CardDescription>
            Find answers to common questions and technical documentation
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by title, content, category, or folder..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : selectedArticle ? (
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between">
              <div className="space-y-2">
                <CardTitle className="text-2xl">{selectedArticle.title}</CardTitle>
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="secondary">{selectedArticle.category}</Badge>
                  <Badge variant="outline">{selectedArticle.folder}</Badge>
                  {selectedArticle.writer && (
                    <span className="text-xs text-muted-foreground">
                      by {selectedArticle.writer.name}
                    </span>
                  )}
                  <span className="text-xs text-muted-foreground">
                    Updated: {formatDate(selectedArticle.updated_at)}
                  </span>
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={() => setSelectedArticle(null)}>
                Back to Search
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div
              className="prose dark:prose-invert max-w-none"
              dangerouslySetInnerHTML={{ __html: selectedArticle.content }}
            />
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {filteredArticles.length === 0 ? (
            <Card>
              <CardContent className="p-12 text-center">
                <Book className="h-16 w-16 mx-auto mb-4 text-muted-foreground/20" />
                <h3 className="text-lg font-medium mb-2">No articles found</h3>
                <p className="text-muted-foreground">
                  {searchQuery
                    ? `No results matching "${searchQuery}"`
                    : 'No wiki articles available'}
                </p>
              </CardContent>
            </Card>
          ) : (
            filteredArticles.map((article) => (
              <Card
                key={article.id}
                className="hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => setSelectedArticle(article)}
              >
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1 space-y-2">
                      <CardTitle className="text-lg flex items-center gap-2">
                        <FileText className="h-5 w-5" />
                        {highlightText(article.title, searchQuery)}
                      </CardTitle>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="secondary">{article.category}</Badge>
                        <Badge variant="outline" className="text-xs">
                          {article.folder}
                        </Badge>
                        {article.writer && (
                          <span className="text-xs text-muted-foreground">
                            by {article.writer.name}
                          </span>
                        )}
                      </div>
                    </div>
                    <ExternalLink className="h-4 w-4 text-muted-foreground shrink-0" />
                  </div>
                  <CardDescription className="line-clamp-2 mt-2">
                    {article.content.replace(/<[^>]*>/g, '').substring(0, 150)}...
                  </CardDescription>
                </CardHeader>
              </Card>
            ))
          )}
        </div>
      )}

      {!selectedArticle && filteredArticles.length > 0 && (
        <div className="text-center text-sm text-muted-foreground">
          Showing {filteredArticles.length} of {articles.length} articles
        </div>
      )}
    </div>
  );
}
