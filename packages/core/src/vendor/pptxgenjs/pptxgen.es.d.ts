interface TextRun {
  text: string;
  options?: Record<string, unknown>;
}

interface Slide {
  addText(text: string | TextRun[], options?: Record<string, unknown>): void;
  addNotes(notes: string | string[]): void;
}

declare class PptxGenJS {
  layout: string;
  addSlide(): Slide;
  writeFile(options: { fileName: string }): Promise<string>;
}

export default PptxGenJS;
