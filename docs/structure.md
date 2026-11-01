# 프로젝트 파일 구조

자세한 턴 흐름과 설계 이유는 루트의 `CLAUDE.md`를 볼 것. 이 문서는 폴더 지도만.

```
app/
  page.tsx                 마운트 후 TowerGame 렌더
  layout.tsx
  api/gm/route.ts          GM 서술 호출 (프롬프트 페이지 + 캐싱)
  api/interpret/route.ts   자유 입력 → 행동 태그
components/
  TowerGame.tsx            턴 흐름, 화면
  ChatWindow.tsx           피드
  InputBox.tsx             선택지 + 자유 입력
  StatusPanel.tsx          상태 패널
  Overlays.tsx             보상 / 추방 / 결말 / 탐사 기록 / 설정
  DebugPanel.tsx           개발용
lib/
  game/types.ts            타입
  game/engine.ts           판정 엔진 (2d6, 적 행동, 시험, 보상, 결말)
  game/prompt.ts           AI에게 보낼 턴 메시지 / 조건부 페이지 선택
  game/parse.ts            AI 응답 파싱
  game/storage.ts          localStorage
  pages.ts                 (서버) 프롬프트 페이지 로더
  anthropic.ts             (서버) Claude 호출
data/
  game-data.json           모든 수치·방·적·보상·쪽지·결말  ← 밸런스는 여기만
  pages/persistent/        항상 보내는 GM 지침 7개 (캐시)
  pages/floors/            층별 지침 (현재 층일 때)
  pages/npcs/              동료·기사·마녀/엄마·결말·다이브 틀 (조건부)
docs/
  story-guide.md           프롬프트 페이지 작성 가이드
```
