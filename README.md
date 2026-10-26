# Tower TRPG

AI 기반 대화형 TRPG 웹앱. 혼수상태인 누나의 의식 속 탑을 탐험하는 스토리.
Claude가 GM 역할, 코드가 판정을 담당하는 구조.

배포: https://tower-trpg.vercel.app

## 실행

`.env.local`에 API 키 설정 후:

```
ANTHROPIC_API_KEY=sk-ant-...
```

```bash
npm install
npm run dev
```

## 스택

- Next.js 16 (App Router)
- @anthropic-ai/sdk (claude-sonnet-4-6)
- Tailwind CSS v4 + shadcn/ui
- 배포: Vercel
