import React, { useState, useEffect } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'
import { ChevronLeft, ChevronRight, X, ZoomIn, ZoomOut } from 'lucide-react'

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString()

interface PDFPreviewProps {
  pdfPath: string | null
  currentPage: number
  onPageChange: (page: number) => void
  onClose: () => void
}

export const PDFPreview: React.FC<PDFPreviewProps> = ({
  pdfPath,
  currentPage,
  onPageChange,
  onClose
}) => {
  const [numPages, setNumPages] = useState(0)
  const [scale, setScale] = useState(1.0)
  const [pdfData, setPdfData] = useState<Uint8Array | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    if (!pdfPath) return
    setPdfData(null)
    setLoadError(null)
    setNumPages(0)

    if (window.electronAPI?.readFileBase64) {
      window.electronAPI.readFileBase64(pdfPath).then((result) => {
        if (!result) {
          setLoadError('Failed to read PDF file')
          return
        }
        const binaryStr = atob(result.data)
        const bytes = new Uint8Array(binaryStr.length)
        for (let i = 0; i < binaryStr.length; i++) {
          bytes[i] = binaryStr.charCodeAt(i)
        }
        setPdfData(bytes)
      }).catch(() => {
        setLoadError('Failed to read PDF file')
      })
    }
  }, [pdfPath])

  if (!pdfPath) {
    return (
      <div className="h-full flex items-center justify-center text-[var(--text-tertiary)] text-sm">
        No PDF loaded
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col bg-[var(--bg)]">
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--border)] bg-[var(--surface)]">
        <div className="flex items-center gap-2">
          <button
            onClick={() => onPageChange(Math.max(1, currentPage - 1))}
            disabled={currentPage <= 1}
            className="p-1 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] rounded-[var(--radius-sm)] transition-colors disabled:opacity-30"
          >
            <ChevronLeft className="h-4 w-4" strokeWidth={2} />
          </button>
          <span className="text-xs text-[var(--text-secondary)] min-w-[80px] text-center">
            {currentPage} / {numPages}
          </span>
          <button
            onClick={() => onPageChange(Math.min(numPages, currentPage + 1))}
            disabled={currentPage >= numPages}
            className="p-1 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] rounded-[var(--radius-sm)] transition-colors disabled:opacity-30"
          >
            <ChevronRight className="h-4 w-4" strokeWidth={2} />
          </button>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setScale((s) => Math.max(0.5, s - 0.2))}
            className="p-1 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] rounded-[var(--radius-sm)] transition-colors"
          >
            <ZoomOut className="h-3.5 w-3.5" strokeWidth={2} />
          </button>
          <span className="text-[11px] text-[var(--text-tertiary)] w-10 text-center">{Math.round(scale * 100)}%</span>
          <button
            onClick={() => setScale((s) => Math.min(2.5, s + 0.2))}
            className="p-1 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] rounded-[var(--radius-sm)] transition-colors"
          >
            <ZoomIn className="h-3.5 w-3.5" strokeWidth={2} />
          </button>
          <button
            onClick={onClose}
            className="ml-2 p-1 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] rounded-[var(--radius-sm)] transition-colors"
          >
            <X className="h-4 w-4" strokeWidth={2} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4 flex justify-center">
        {loadError ? (
          <div className="text-center text-sm text-[var(--danger)] py-8">
            {loadError}
          </div>
        ) : !pdfData ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-6 w-6 border-2 border-[var(--border-strong)] border-t-[var(--primary)]" />
          </div>
        ) : (
          <Document
            file={{ data: pdfData }}
            onLoadSuccess={({ numPages }) => setNumPages(numPages)}
            loading={
              <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-6 w-6 border-2 border-[var(--border-strong)] border-t-[var(--primary)]" />
              </div>
            }
            error={
              <div className="text-center text-sm text-[var(--danger)] py-8">
                Failed to load PDF
              </div>
            }
          >
            <Page
              pageNumber={currentPage}
              scale={scale}
              renderTextLayer
              renderAnnotationLayer
              className="shadow-[var(--shadow-md)]"
            />
          </Document>
        )}
      </div>
    </div>
  )
}
