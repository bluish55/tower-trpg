# 꼭대기까지 데려다줄게 (Tower TRPG)

AI가 GM을 맡는 한국어 텍스트 TRPG 웹앱. 공학설계입문 프로젝트.

3년째 깨어나지 않는 여동생 하은의 머릿속, 그 애가 좋아하던 판타지 소설 속 탑을 오빠 진우가 오른다.
탑 안에서 쓰러지면 바깥으로 튕겨 나오고, 진우는 안에서 있었던 일을 기억하지 못한다. 기억하는 건 플레이어뿐이다.

> 이겨내는 경험이 위로가 된다. AI 롤플레잉은 도피가 아니다.

**설계 원칙: AI는 이야기하고, 코드는 결정한다.**
주사위·적 행동·시험 제한 턴·보상·결말 판정은 전부 코드(`lib/game/engine.ts`)가 먼저 끝내고,
Claude는 그 결과를 받아 서술과 다음 선택지만 쓴다.

배포: https://tower-trpg.vercel.app

## 실행

```bash
npm install
npm run dev
```

브라우저에서 **설정 → Anthropic API 키**를 넣고 시작한다 (BYOK).
키는 브라우저에만 저장되고, 요청마다 이 앱의 서버를 거쳐 Anthropic으로만 전달된다. 서버에 저장하지 않는다.

### 환경변수 (모두 선택)

| 이름 | 용도 |
|------|------|
| `GM_MODEL` | 기본 모델. 없으면 `claude-sonnet-5-5`. 설정 화면에서 플레이어가 바꿀 수 있다 |
| `ALLOW_SERVER_KEY` | `true`일 때만 키를 안 넣은 요청에 서버 키를 쓴다. **공개 배포에서는 켜지 말 것** (남의 크레딧으로 플레이됨) |
| `ANTHROPIC_API_KEY` | 위가 `true`일 때 쓰는 서버 키 (로컬 개발용) |

## 스택

- Next.js 16 (App Router), React 19, TypeScript
- `@anthropic-ai/sdk` — 프롬프트 캐싱, 길이 제한으로 잘린 응답 자동 이어쓰기
- Tailwind CSS v4
- 배포: Vercel

구조와 턴 흐름은 [`CLAUDE.md`](./CLAUDE.md), 프롬프트 페이지 작성법은 [`docs/story-guide.md`](./docs/story-guide.md).
