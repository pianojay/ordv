# Markdown to PDF

## 1. single md to pdf
vscode로 보고 있는 md 하나를 pdf로 변환 -> [vscode-markdown-pdf \(yzane\)](https://github.com/yzane/vscode-markdown-pdf)

## 2. batch and merge
그러나 batch 및 pipelining이 어렵다.- > 스크립트: [npm install -g md-to-pdf](https://github.com/simonhaenisch/md-to-pdf)

예를 들어 어떤 dir 아래에 markdown 파일들이 어떤 dir 구조를 이루고 있다고 하자.

그러면 이것의 변환 결과는 dir 구조를 유지하며 md 들이 pdf로 바뀐 것을 생각할 수 있다.

만약 하나의 PDF로 병합을 하고자 한다면?

그러면 sub-dir 마다, 또는 ordinal을 정해서 md 파일들을 aggregate할 수 있다.

md-to-pdf는 md 간의 병합을 지원한다. 이때 병합 규칙은 사용자 지정이다. \(.bash\)


## 3. hypertext
그리고, md 파일의 링크를 참조해서 자동으로 병합하는 것도 좋을 것 같다.

"merger" 가 hypertext를 확인해서 candidate로 여기고, user가 이 chain을 선택 및 순서를 지정할 수 있다.

Graph를 보여주고 사용자가 순서를 지정하는 UI를 생각해볼 수 있다.

한편, Obsidian에 의존하지 않는 솔루션이면 좋을 것이다.

현존하는 솔루션:
| 도구 | 링크 기반 탐색 | 병합 | 순서 지정 | 특징 |
|---|---|---|---|---|
| [stitchmd](https://github.com/abhinav/stitchmd?utm_source=chatgpt.com) | 명시적 목차 기반 | O | O | 내부 링크 자동 수정 |
| [Apex](https://github.com/ApexMarkdown/apex?utm_source=chatgpt.com) | `SUMMARY.md` 기반 | O | O | 목차의 링크를 따라 병합 |
| [drft](https://github.com/johnmdonahue/drft-cli?utm_source=chatgpt.com) | **일반 Markdown 링크** | X | X | 문서 그래프 추출 |
| [concat-md](https://github.com/ozum/concat-md?utm_source=chatgpt.com) | X | O | 파일명 정렬 | 디렉터리 기반 병합 |