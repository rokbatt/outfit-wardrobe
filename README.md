# OUTFIT — 내 옷으로 더 많이 입는 디지털 옷장

Next.js 16 · Tailwind 4 · Supabase · Claude API. 설계 문서: [`docs/DESIGN.md`](docs/DESIGN.md)

## 바로 실행 (설정 0개)

```bash
npm install
npm run dev          # http://localhost:3000
```

env가 없으면 **브라우저 IndexedDB**에 저장되고, 사진 분석은 "대표색 자동 추출 + 칩 선택"으로 동작합니다.
홈에서 **샘플 옷장으로 둘러보기**를 누르면 22벌 + 착용 기록이 채워져 모든 화면을 바로 확인할 수 있어요.

폰에서 테스트: 같은 Wi-Fi에서 `npm run dev -- -H 0.0.0.0` 후 `http://<PC IP>:3000`.
(카메라 촬영 input은 HTTPS 또는 localhost에서 가장 안정적입니다 — Vercel 배포 권장)

## AI 옷 분석 켜기

`.env.local`
```
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_VISION_MODEL=claude-haiku-4-5-20251001   # 기본값, 더 정확히: claude-sonnet-5
```
- 등록 1건당 호출 1회. 이미지는 브라우저에서 768px로 줄여 전송 → 입력 토큰 최소화.
- 결과는 tool-use 스키마로 강제되고, 서버에서 taxonomy 밖 값은 버립니다(`app/api/analyze/route.ts`).
- AI가 채운 필드에는 "AI 추정 · 수정 가능" 표시. 사용자가 먼저 건드린 필드는 AI가 덮어쓰지 않습니다.

## AI TRY-ON 켜기 (선택)

Outfit Builder의 기본 화면은 누끼 사진을 쌓은 **2D 룩북**이고, 사실적인 착용 모습은 **AI TRY-ON 버튼을 누를 때만** Gemini 이미지 모델로 생성합니다.

`.env.local`
```
GEMINI_API_KEY=...                         # https://aistudio.google.com/apikey (유료 티어 필요)
GEMINI_IMAGE_MODEL=gemini-3.1-flash-image  # 기본값. 2.5 Flash Image는 2026-10-02 종료
```
- 키가 없으면 버튼 대신 "AI 착용은 GEMINI_API_KEY 설정 필요" 안내만 표시됩니다.
- 기준 인물: 프로필의 **내 전신 사진** → 없으면 성별·키·체형에 맞춘 **기본 모델**을 처음 한 번 생성해 저장 후 재사용(설정을 바꾸면 다시 생성).
- 한 번 호출에 기준 인물 1장 + 현재 코디의 누끼(카테고리 라벨 포함)를 함께 보냅니다. 사진 없는 옷은 텍스트 설명으로 전달.
- 캐시: (기준 인물 + 정렬된 옷 id + 렌더 옵션·모델) 조합이 같으면 다시 호출하지 않습니다. 저장은 Repo 경유 — 로컬은 IndexedDB, Supabase는 `wardrobe/{user_id}/tryon/…`.
- 비용: 1K 이미지 1장 ≈ $0.067 + 입력 토큰. 호출마다 서버 콘솔에 `[tryon] … ≈ $0.07` 로그가 남습니다.
- 요청은 stateless `generateContent` 로 보내 Google 쪽에 대화 기록을 남기지 않습니다.

## Supabase 연결

1. Supabase 프로젝트 생성 → SQL Editor에서 `supabase/schema.sql` 실행
2. Authentication → Providers → **Anonymous sign-ins 허용**
3. 이미 v1 스키마를 적용했다면 `supabase/migrations/002_mannequin.sql`, `003_tryon.sql` 을 차례로 추가 실행 (새 프로젝트는 `schema.sql` 에 포함)
   - 003 미적용 DB에서도 앱은 동작합니다. AI 착용 이미지가 세션에만 유지되고 전신 사진 업로드가 비활성화될 뿐입니다.
4. `.env.local`
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
   ```
익명 계정으로 즉시 시작하고, 나중에 이메일 계정으로 연결(`auth.updateUser`)할 수 있는 구조입니다.
이미지는 비공개 버킷 `wardrobe/{user_id}/…`, 모든 테이블 RLS 적용.

## 배경 제거 (선택: 더 정확하게)

기본은 브라우저 내 무료 알고리즘(단색 바닥·벽·침대 위 사진에 적합). 흰 옷을 흰 배경에 찍은 사진처럼 어려운 경우는 자동으로 원본을 사용합니다.
더 정확한 누끼가 필요하면 `.env.local` 에 `REMOVE_BG_API_KEY=...` (remove.bg) — 서버 API가 우선 사용됩니다.

## 구조

```
app/
  page.tsx               HOME — 오늘의 코디 · 옷장 요약 · 잠든 옷 · 최근 추가
  add/                   옷 추가 — 촬영/여러 장 선택 → 정리 → 분석 → 확인 → 저장(연속)
  wardrobe/              옷장 — 카테고리 탭 · 색/계절/스타일/브랜드 필터 · 정렬 · 잠든 옷
  wardrobe/[id]/         상세 — 착용 통계 · 편집/사진 교체 · 이 옷으로 만든 조합
  outfit/                OUTFIT BUILDER — 2D 룩북(누끼 스택·줄별 스와이프) · 고정 · 랜덤 · 저장 · AI TRY-ON
  outfits/               MY OUTFITS — 상황별 · Wear this
  ai/                    Stylist — 조건 → 3가지 룩 (현재 규칙 엔진, Phase 2에 Claude 연결)
  profile/               선호 설정 · 백업 내보내기
  api/analyze/           Claude vision 태깅
  api/tryon/             Gemini 이미지 — 기본 모델 생성 · 착용 이미지 생성
lib/
  repo/                  Repo 인터페이스 + LocalRepo(IndexedDB) + SupabaseRepo
  styling.ts             규칙 기반 조합 점수 (AI 호출 0)
  tryon.ts               AI 착용 — 캐시 키 · 참고 이미지 준비 · /api/tryon 호출
  image.ts               리사이즈 · WebP · 대표색 추출
  taxonomy.ts            카테고리/색/스타일 사전
supabase/schema.sql      테이블 · 트리거 · RLS · Storage 정책
```

## 진행 상황

| STEP | 내용 | 상태 |
|---|---|---|
| 1–4 | 서비스·페이지·스키마·컴포넌트 설계 | ✅ `docs/DESIGN.md` |
| 5 | MVP UI (모바일 하단 탭 / 데스크톱 사이드바) | ✅ |
| 6 | Supabase 연결 (Repo 추상화, 익명 인증, RLS) | ✅ 코드·SQL 완료, 실제 프로젝트 연결은 env 필요 |
| 7 | 옷 등록 + 이미지 저장 | ✅ |
| 8 | Wardrobe (필터·정렬·상세·편집·삭제) | ✅ |
| 9 | Outfit Builder + 코디 저장 | ✅ |
| 10 | AI 기능 | 🟡 사진 분석 완료 · 코디 추천은 규칙 엔진으로 동작, Claude 연결은 Phase 2 |

Phase 1 범위를 넘어 미리 넣은 것: 착용 기록(WEAR THIS, 취소 가능), 잠든 옷 발견, 조건별 3룩 추천(규칙 기반).

### 다음 (Phase 2)
- `/api/stylist`: 옷장을 텍스트 JSON(이미지 X)으로 Claude에 전달 → 아이템 id + 이유 3안, `ai_recommendations`에 캐시
- 착용 캘린더 · 활용도 대시보드 (이번 달 28/42, 자주/잘 안 입는 옷 분포)
- 배경 제거 토글 (`@imgly/background-removal`, 브라우저 WASM, 서버 비용 0)
- PWA 매니페스트 + 홈 화면 추가
