/// <reference types="vite/client" />

declare module "html2pdf.js" {
  type Html2PdfJsPdf = {
    internal: {
      getNumberOfPages: () => number;
      pageSize: { getWidth: () => number; getHeight: () => number };
    };
    setPage: (page: number) => void;
    setFontSize: (size: number) => void;
    setTextColor: (r: number, g: number, b: number) => void;
    text: (text: string, x: number, y: number, options?: { align?: "left" | "center" | "right" }) => void;
    output: (type: "blob") => Blob;
  };
  type Html2PdfWorker = {
    set: (opt: unknown) => Html2PdfWorker;
    from: (el: HTMLElement) => Html2PdfWorker;
    toPdf: () => Html2PdfWorker;
    get: (key: "pdf") => Promise<Html2PdfJsPdf>;
    outputPdf: (type: "blob") => Promise<Blob>;
    save: () => Promise<void>;
  };
  const html2pdf: () => Html2PdfWorker;
  export default html2pdf;
}
