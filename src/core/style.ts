import { promises as fs } from 'node:fs';

const assets = new URL('../../assets/styles/vscode/', import.meta.url);
let cached: Promise<string> | undefined;

// Keep upstream order: VS Code Markdown, highlighting, then yzane PDF rules.
// Full notices travel with embedded CSS as well as the source asset directory.
export function readingStyle(): Promise<string> {
  return cached ||= (async () => {
    const names = ['markdown.css', 'highlight-default.css', 'markdown-pdf.css'];
    const licenses = ['LICENSE-microsoft.txt', 'LICENSE-yzane.txt', 'LICENSE-highlightjs.txt'];
    const notices = (await Promise.all(licenses.map(name => fs.readFile(new URL(name, assets), 'utf8')))).join('\n');
    const styles = await Promise.all(names.map(name => fs.readFile(new URL(name, assets), 'utf8')));
    return `/* ordv default preset: adapted from VS Code / yzane Markdown PDF\n${notices.replace(/\*\//g, '* /')}\n*/\n${styles.join('\n')}\n${packetStyle}`;
  })();
}

// Packet structure and print safety; typography remains in the upstream files.
const packetStyle = `
*{box-sizing:border-box}body{color:#222;background:white;font-family:-apple-system,BlinkMacSystemFont,"Segoe WPC","Segoe UI","Malgun Gothic","Ubuntu","Droid Sans",sans-serif,"Meiryo"}
h1,h2,h3,h4,h5,h6{break-after:avoid}a{color:#007acc}.heading-link{color:inherit}
.source{font-size:11px;color:#666;overflow-wrap:anywhere}.section-label{font-size:14px;color:#666}
.doc,.navigation,.graph-page{break-before:page}.doc:first-child,.navigation:first-child{break-before:auto}
.doc[style^="font-size"]{line-height:1.5714286}
.toc ul{list-style:none;padding-left:18px}.toc>ul{padding-left:0}.toc li{margin:6px 0}.toc .heading-entry{font-size:12px}
thead{display:table-header-group}tr{break-inside:avoid}table{max-width:100%}img,svg{max-width:100%;height:auto}
.missing,.reference-note{color:#97501c;font-size:12px}.mermaid{display:flex;justify-content:center;break-inside:avoid}.mermaid svg{max-height:550px}
pre.mermaid{background:transparent;border:0;padding:0}pre code{white-space:pre-wrap;overflow-wrap:anywhere}
.katex-display{overflow:visible}eqn{display:block;text-align:center;margin:1em 0}eq{display:inline}section.doc{overflow-wrap:break-word}
@media screen{body{max-width:850px;margin:auto;padding:36px}.doc{border-top:1px solid #ddd;margin-top:40px;padding-top:24px}}
@media print{.screen-only{display:none}a{overflow-wrap:anywhere}}
`;
