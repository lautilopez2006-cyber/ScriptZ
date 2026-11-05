// Ambient module declarations for assets handled by the bundler.
declare module '*.ttf' { const url: string; export default url }
declare module '*.css' {}
declare module 'pdfjs-dist/build/pdf.worker.min.mjs' { export const WorkerMessageHandler: unknown }
