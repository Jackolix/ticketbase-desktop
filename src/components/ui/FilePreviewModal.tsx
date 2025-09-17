import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  X,
  Download,
  RotateCw,
  Maximize2,
  FileText,
  Image as ImageIcon,
  File,
  Video,
  Music,
  Archive,
  Loader2,
  ExternalLink
} from 'lucide-react';

interface FilePreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  filename: string;
  ticketId: number;
  onDownload: () => void;
  isDownloading?: boolean;
}

interface FileTypeInfo {
  type: 'image' | 'pdf' | 'text' | 'video' | 'audio' | 'archive' | 'office' | 'unknown';
  icon: React.ComponentType<{ className?: string }>;
  category: string;
  previewable: boolean;
}

const getFileTypeInfo = (filename: string): FileTypeInfo => {
  const extension = filename.split('.').pop()?.toLowerCase() || '';

  const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg'];
  const textExtensions = ['txt', 'md', 'json', 'xml', 'csv', 'log'];
  const videoExtensions = ['mp4', 'avi', 'mov', 'wmv', 'flv', 'webm'];
  const audioExtensions = ['mp3', 'wav', 'ogg', 'flac', 'aac'];
  const archiveExtensions = ['zip', 'rar', '7z', 'tar', 'gz'];
  const officeExtensions = ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'];

  if (imageExtensions.includes(extension)) {
    return { type: 'image', icon: ImageIcon, category: 'Image', previewable: true };
  }
  if (extension === 'pdf') {
    return { type: 'pdf', icon: FileText, category: 'PDF Document', previewable: true };
  }
  if (textExtensions.includes(extension)) {
    return { type: 'text', icon: FileText, category: 'Text File', previewable: true };
  }
  if (videoExtensions.includes(extension)) {
    return { type: 'video', icon: Video, category: 'Video', previewable: true };
  }
  if (audioExtensions.includes(extension)) {
    return { type: 'audio', icon: Music, category: 'Audio', previewable: true };
  }
  if (archiveExtensions.includes(extension)) {
    return { type: 'archive', icon: Archive, category: 'Archive', previewable: false };
  }
  if (officeExtensions.includes(extension)) {
    return { type: 'office', icon: FileText, category: 'Office Document', previewable: true };
  }

  return { type: 'unknown', icon: File, category: 'File', previewable: false };
};

export function FilePreviewModal({
  isOpen,
  onClose,
  filename,
  ticketId,
  onDownload,
  isDownloading = false
}: FilePreviewModalProps) {
  const [fileBlob, setFileBlob] = useState<Blob | null>(null);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(100);
  const [rotation, setRotation] = useState(0);

  const fileInfo = getFileTypeInfo(filename);
  const IconComponent = fileInfo.icon;

  useEffect(() => {
    if (isOpen && fileInfo.previewable) {
      loadFilePreview();
    }
    return () => {
      if (fileUrl) {
        URL.revokeObjectURL(fileUrl);
      }
    };
  }, [isOpen, filename, ticketId]);

  const loadFilePreview = async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Import the API client dynamically to avoid circular dependencies
      const { apiClient } = await import('@/lib/api');
      const blob = await apiClient.downloadAttachment(ticketId, filename);
      setFileBlob(blob);

      const url = URL.createObjectURL(blob);
      setFileUrl(url);
    } catch (err) {
      console.error('Failed to load file preview:', err);
      setError('Failed to load file preview. Please try downloading the file instead.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleZoomIn = () => setZoom(prev => Math.min(prev + 25, 200));
  const handleZoomOut = () => setZoom(prev => Math.max(prev - 25, 25));
  const handleRotate = () => setRotation(prev => (prev + 90) % 360);
  const handleReset = () => {
    setZoom(100);
    setRotation(0);
  };

  const handleWheel = (e: React.WheelEvent) => {
    if (fileInfo.type === 'image') {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -25 : 25; // Scroll down = zoom out, scroll up = zoom in
      setZoom(prev => Math.max(25, Math.min(200, prev + delta)));
    }
  };

  const handleOpenExternally = async () => {
    if (!fileBlob) return;

    try {
      const { WindowManager } = await import('@/lib/windowManager');
      await WindowManager.openFileExternally(filename, fileBlob);
      onClose(); // Close the modal after opening externally
    } catch (error) {
      console.error('Failed to open file externally:', error);
    }
  };

  const renderPreview = () => {
    if (isLoading) {
      return (
        <div className="flex items-center justify-center h-96">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="h-8 w-8 animate-spin" />
            <p className="text-muted-foreground">Loading preview...</p>
          </div>
        </div>
      );
    }

    if (error) {
      return (
        <div className="flex items-center justify-center h-96">
          <div className="text-center">
            <File className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground mb-2">{error}</p>
            <Button onClick={onDownload} disabled={isDownloading}>
              {isDownloading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
              Download File
            </Button>
          </div>
        </div>
      );
    }

    if (!fileUrl || !fileInfo.previewable) {
      return (
        <div className="flex items-center justify-center h-96">
          <div className="text-center">
            <IconComponent className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground mb-2">Preview not available for this file type</p>
            <Button onClick={onDownload} disabled={isDownloading}>
              {isDownloading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
              Download File
            </Button>
          </div>
        </div>
      );
    }

    const commonStyle = {
      transform: `scale(${zoom / 100}) rotate(${rotation}deg)`,
      transition: 'transform 0.2s ease-in-out',
    };

    switch (fileInfo.type) {
      case 'image':
        return (
          <div
            className="flex items-center justify-center min-h-96 overflow-auto cursor-zoom-in"
            onWheel={handleWheel}
          >
            <img
              src={fileUrl}
              alt={filename}
              style={commonStyle}
              className="max-w-full max-h-[70vh] object-contain select-none"
              draggable={false}
            />
          </div>
        );

      case 'pdf':
        return (
          <div className="h-[70vh] w-full">
            <iframe
              src={fileUrl}
              className="w-full h-full border-0"
              title={filename}
            />
          </div>
        );

      case 'text':
        return (
          <div className="h-96 overflow-auto">
            <pre className="p-4 bg-muted rounded-lg text-sm whitespace-pre-wrap">
              {fileBlob && <FileTextContent blob={fileBlob} />}
            </pre>
          </div>
        );

      case 'video':
        return (
          <div className="flex items-center justify-center">
            <video
              src={fileUrl}
              controls
              className="max-w-full max-h-[70vh]"
              style={commonStyle}
            >
              Your browser does not support the video tag.
            </video>
          </div>
        );

      case 'audio':
        return (
          <div className="flex items-center justify-center h-96">
            <div className="text-center">
              <Music className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
              <audio src={fileUrl} controls className="mb-4">
                Your browser does not support the audio tag.
              </audio>
              <p className="text-muted-foreground">{filename}</p>
            </div>
          </div>
        );

      case 'office':
        return (
          <div className="h-[70vh] w-full">
            <iframe
              src={`https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(fileUrl)}`}
              className="w-full h-full border-0"
              title={filename}
            />
          </div>
        );

      default:
        return null;
    }
  };

  const showControls = fileInfo.type === 'image' && !isLoading && !error && fileUrl;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden">
        <DialogHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <div className="flex items-center gap-3">
            <IconComponent className="h-5 w-5" />
            <div>
              <DialogTitle className="text-lg font-semibold">{filename}</DialogTitle>
              <DialogDescription className="sr-only">
                Preview and manage the file {filename} of type {fileInfo.category}
              </DialogDescription>
              <Badge variant="secondary" className="mt-1">
                {fileInfo.category}
              </Badge>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {fileBlob && (
              <Button variant="outline" size="sm" onClick={handleOpenExternally} title="Open with default application">
                <ExternalLink className="h-4 w-4" />
              </Button>
            )}
            {showControls && (
              <>
                <span className="text-sm text-muted-foreground px-2">{zoom}%</span>
                <Button variant="outline" size="sm" onClick={handleRotate}>
                  <RotateCw className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="sm" onClick={handleReset}>
                  <Maximize2 className="h-4 w-4" />
                </Button>
              </>
            )}
            <Button variant="outline" size="sm" onClick={onDownload} disabled={isDownloading}>
              {isDownloading ? <Loader2 className="h-4 w-4" /> : <Download className="h-4 w-4" />}
            </Button>
            <Button variant="outline" size="sm" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-hidden">
          {renderPreview()}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Helper component to read text file content
function FileTextContent({ blob }: { blob: Blob }) {
  const [content, setContent] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const readContent = async () => {
      try {
        const text = await blob.text();
        setContent(text);
      } catch (err) {
        setContent('Error reading file content');
      } finally {
        setIsLoading(false);
      }
    };

    readContent();
  }, [blob]);

  if (isLoading) {
    return <div className="flex items-center justify-center"><Loader2 className="h-4 w-4 animate-spin" /></div>;
  }

  return <>{content}</>;
}