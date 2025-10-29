// Type declarations for pdf-lib (stub for Cloudflare Workers compatibility)
// pdf-lib types are loaded dynamically at runtime

declare module 'pdf-lib' {
  export interface PDFFont {
    sizeAtHeight(height: number): number;
    widthOfTextAtSize(text: string, size: number): number;
  }
  
  export interface RGB {
    red: number;
    green: number;
    blue: number;
  }
  
  export function rgb(red: number, green: number, blue: number): RGB;
  
  export enum StandardFonts {
    Helvetica = 'Helvetica',
    HelveticaBold = 'HelveticaBold',
    TimesRoman = 'TimesRoman',
    TimesRomanBold = 'TimesRomanBold',
    Courier = 'Courier',
    CourierBold = 'CourierBold'
  }
  
  export class PDFDocument {
    static create(): Promise<PDFDocument>;
    addPage(size: [number, number]): PDFPage;
    embedFont(font: StandardFonts): Promise<PDFFont>;
    save(): Promise<Uint8Array>;
  }
  
  export interface PDFPage {
    getSize(): { width: number; height: number };
    drawText(text: string, options?: { x?: number; y?: number; size?: number; font?: PDFFont; color?: RGB; maxWidth?: number }): void;
  }
}

