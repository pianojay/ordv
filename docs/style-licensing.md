# VS Code style reuse and attribution

Checked 14 October 2026 against installed `yzane.markdown-pdf` 2.2.0 and upstream license texts.

The verified Markdown styles can be copied and adapted, including in a private or commercial application, **provided their copyright and permission notices are retained**. Removing those notices is not an acceptable way to reuse the files. The MIT text does not require an on-screen acknowledgement, logo, or attribution on every generated PDF; it requires the notice to accompany copies or substantial portions of the software.

## Verified sources

| Asset | Source and license | Required handling |
| --- | --- | --- |
| `styles/markdown-pdf.css` | yzane's extension; [MIT license](https://github.com/yzane/vscode-markdown-pdf/blob/master/LICENSE.txt), copyright yzane | Retain upstream copyright/license text in distributed source and installation packages. |
| `styles/markdown.css` | Its file header identifies Microsoft VS Code and the MIT license; [Microsoft license](https://github.com/microsoft/vscode/blob/main/LICENSE.txt) | Keep the Microsoft header and full MIT notice. yzane's notice alone does not replace the original Microsoft notice. |
| Highlight.js code and selected built-in theme CSS | [BSD 3-Clause](https://github.com/highlightjs/highlight.js/blob/main/LICENSE), copyright Ivan Sagalaev | Preserve copyright, conditions, and disclaimer in source distributions and package documentation. Do not suggest endorsement by the copyright holders. |

The extension's `tomorrow.css` also references the original Tomorrow theme and a separate adaptation. Before vendoring that particular file as an exact compatibility asset, record its provenance and applicable notices. The verified dependency theme can be used for the initial preset while that asset-level review is completed. Do not infer licensing for unrelated icons, logos, screenshots, fonts, or templates from the CSS review.

## Packaging plan

Vendor approved CSS from a pinned revision into `assets/styles/vscode/`, retaining original headers. Place full source notices next to those assets and summarize them in a root `THIRD_PARTY_NOTICES.md`. Include those files in both npm and desktop/plugin bundles. Use an automated package-content check to prevent notices from being omitted during bundling.

The preset description should say that it uses styles adapted from VS Code and yzane's Markdown PDF extension. That is useful provenance; a visible credit banner on every page is not a requirement of the verified MIT licenses. Treat a copy of the CSS embedded in a distributed HTML document as a software copy and preserve a notice there as well.

No upstream CSS has been vendored into the application yet. The previous comparison used installed assets only in ignored inspection output. This review does not select a license for ordv's own code or claim approval of a complete redistribution of the VS Code extension.
