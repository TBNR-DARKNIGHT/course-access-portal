import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

interface PdfDocumentViewerProps {
  file: string;
  title: string;
  onProgress?: (progress: { pagesViewed: number[]; pageCount: number }) => void;
}

function LazyPdfPage({
  pageNumber,
  width,
  scrollRoot,
  onVisible,
}: {
  pageNumber: number;
  width?: number;
  scrollRoot: RefObject<HTMLDivElement | null>;
  onVisible: (pageNumber: number) => void;
}) {
  const placeholderRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(pageNumber <= 2);

  useEffect(() => {
    if (visible) onVisible(pageNumber);
  }, [onVisible, pageNumber, visible]);

  useEffect(() => {
    if (visible || !placeholderRef.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { root: scrollRoot.current, rootMargin: '800px 0px' },
    );
    observer.observe(placeholderRef.current);
    return () => observer.disconnect();
  }, [scrollRoot, visible]);

  if (!visible) {
    return (
      <div ref={placeholderRef} className="pdf-page-placeholder">
        Page {pageNumber}
      </div>
    );
  }

  return (
    <Page
      pageNumber={pageNumber}
      width={width}
      renderAnnotationLayer
      renderTextLayer
      className="pdf-page"
      loading={<div className="pdf-page-placeholder">Loading page {pageNumber}...</div>}
    />
  );
}

export function PdfDocumentViewer({ file, title, onProgress }: PdfDocumentViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const onProgressRef = useRef(onProgress);
  const lastProgressSignatureRef = useRef<string | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [pageCount, setPageCount] = useState(0);
  const [pagesViewed, setPagesViewed] = useState<Set<number>>(() => new Set());

  useEffect(() => {
    onProgressRef.current = onProgress;
  }, [onProgress]);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const updateWidth = () => setContainerWidth(element.clientWidth);
    updateWidth();

    const observer = new ResizeObserver(updateWidth);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const pageWidth = containerWidth > 0 ? Math.min(containerWidth - 24, 920) : undefined;

  const markPageViewed = useCallback((pageNumber: number) => {
    setPagesViewed((current) => {
      if (current.has(pageNumber)) return current;
      const next = new Set(current);
      next.add(pageNumber);
      return next;
    });
  }, []);

  useEffect(() => {
    if (!onProgressRef.current || pageCount <= 0 || pagesViewed.size === 0) return;
    const viewedPages = [...pagesViewed].sort((a, b) => a - b);
    const signature = `${pageCount}:${viewedPages.join(',')}`;
    if (lastProgressSignatureRef.current === signature) return;
    lastProgressSignatureRef.current = signature;
    onProgressRef.current({ pagesViewed: viewedPages, pageCount });
  }, [pageCount, pagesViewed]);

  return (
    <div ref={containerRef} className="pdf-viewer" aria-label={`${title} PDF viewer`}>
      <Document
        file={file}
        loading={<p className="viewer-message">Loading document...</p>}
        error={<p className="viewer-message is-error">The PDF could not be displayed.</p>}
        onLoadSuccess={({ numPages }) => {
          lastProgressSignatureRef.current = null;
          setPagesViewed(new Set());
          setPageCount(numPages);
        }}
      >
        <div className="pdf-page-list">
          {Array.from({ length: pageCount }, (_, index) => (
            <LazyPdfPage
              key={`page-${index + 1}`}
              pageNumber={index + 1}
              width={pageWidth}
              scrollRoot={containerRef}
              onVisible={markPageViewed}
            />
          ))}
        </div>
      </Document>
    </div>
  );
}
