# DES-015: ライブサイト セレクタ検証システム

## Context

**Problem**: 4 つの AI プラットフォーム (Gemini, Claude, ChatGPT, Perplexity) は頻繁に DOM を更新する。現在の fixture テストは静的 HTML に基づいており、ライブサイトの変更を検知できない。手動での 4 サイト巡回は時間がかかり、確実性も担保できない。

**Goal**: ログイン済みアカウントを使い、全プラットフォームの CSS セレクタが実際の DOM に対して有効かどうかを日次で自動検証し、結果を通知する。

**Scope**: Tier 1 (セレクタ smoke test) のみ。拡張機能のロードや抽出実行は含まない。CI は対象外 (ローカル実行のみ)。

**Related**: ADR-005 (Shared Selector Modules)

---

## 受入基準

- 全プラットフォームの全セレクタグループに対して PASS/WARN/FAIL を判定できる
- 認証切れの場合は `AUTH_EXPIRED` として明確に区別し、FAIL と混同しない
- 1 プラットフォームの障害が他プラットフォームの検証をブロックしない
- WARN または FAIL が 1 つでもあれば Obsidian に通知ノートを作成する
- 日次で自動実行される (launchd)
- 初回実行時のベースラインを保存し、以降はベースラインとの乖離を検知する

---

## Design Decisions

### Phase 1: セレクタ共有モジュールの抽出

ADR-005 に基づき、各 extractor の SELECTORS 定数を共有モジュールに移動する。

#### 1.1 — ディレクトリ構造

```
src/content/extractors/selectors/
├── types.ts          # 型定義
├── gemini.ts         # Gemini セレクタ (as-is from src/content/extractors/gemini.ts L26-L114)
├── claude.ts         # Claude セレクタ (as-is from src/content/extractors/claude.ts L27-L113)
├── chatgpt.ts        # ChatGPT セレクタ (as-is from src/content/extractors/chatgpt.ts L20-L51)
├── perplexity.ts     # Perplexity セレクタ (as-is from src/content/extractors/perplexity.ts L20-L49)
└── index.ts          # 集約 re-export (smoke test 用)
```

**重要**: セレクタ定義は各ソースファイルの該当行から **そのまま** 移動する。近似値やサンプルコードではなく、実コードを extract as-is とする。

#### 1.2 — セレクタ型定義

```typescript
// src/content/extractors/selectors/types.ts

/**
 * セレクタ配列: CSS セレクタを安定度の高い順に並べたもの
 * queryWithFallback() が先頭から順に試行する
 */
export type SelectorList = readonly string[];

/**
 * プラットフォームごとのセレクタ定義
 * Record<セレクタ名, セレクタ配列>
 *
 * Note: `as const satisfies SelectorGroup` パターンで使用する。
 * `as const` がリテラル型を保持し、`satisfies` が構造を検証する。
 * これにより SELECTORS.conversationTurn のような具体的キーアクセスが型安全に維持される。
 */
export type SelectorGroup = Readonly<Record<string, SelectorList>>;

/**
 * プリコンピュート済みセレクタ文字列
 * SelectorList を .join(',') した結果
 */
export type ComputedSelectors = Readonly<Record<string, string>>;
```

#### 1.3 — セレクタモジュール

各プラットフォームのセレクタ定数は、対応する extractor ソースファイルから **as-is** で移動する。

移動対象:

| Platform | 定数名 | 移動元 |
|----------|--------|-------|
| Gemini | `SELECTORS` | `gemini.ts` L26-L61 |
| Gemini | `DEEP_RESEARCH_SELECTORS` | `gemini.ts` L67-L84 |
| Gemini | `DEEP_RESEARCH_LINK_SELECTORS` | `gemini.ts` L89-L103 |
| Gemini | `COMPUTED_SELECTORS` | `gemini.ts` L109-L114 |
| Claude | `SELECTORS` | `claude.ts` L27-L71 |
| Claude | `DEEP_RESEARCH_SELECTORS` | `claude.ts` L78-L105 |
| Claude | `JOINED_SELECTORS` | `claude.ts` L111-L113 |
| ChatGPT | `SELECTORS` | `chatgpt.ts` L20-L51 |
| Perplexity | `SELECTORS` | `perplexity.ts` L20-L49 |

変更:
- `const` → `export const`
- `as const satisfies SelectorGroup` (または `ComputedSelectors`) を付与
- JSDoc コメントも移動
- それ以外の変更なし

#### 1.4 — 集約モジュール

```typescript
// src/content/extractors/selectors/index.ts

export {
  SELECTORS as GEMINI_SELECTORS,
  DEEP_RESEARCH_SELECTORS as GEMINI_DR_SELECTORS,
  DEEP_RESEARCH_LINK_SELECTORS as GEMINI_DR_LINK_SELECTORS,
} from './gemini';

export {
  SELECTORS as CLAUDE_SELECTORS,
  DEEP_RESEARCH_SELECTORS as CLAUDE_DR_SELECTORS,
} from './claude';

export { SELECTORS as CHATGPT_SELECTORS } from './chatgpt';

export { SELECTORS as PERPLEXITY_SELECTORS } from './perplexity';
```

Note: `COMPUTED_SELECTORS` / `JOINED_SELECTORS` は extractor 内部でのみ使用するため集約 export には含めない。smoke test は raw な `SelectorList` 配列を検証する。

#### 1.5 — Extractor 側の変更

各 extractor で SELECTORS 定数の定義を削除し、import に置き換える。

```diff
# gemini.ts
- const SELECTORS = { ... };
- const DEEP_RESEARCH_SELECTORS = { ... };
- const DEEP_RESEARCH_LINK_SELECTORS = { ... };
- const COMPUTED_SELECTORS = { ... };
+ import {
+   SELECTORS,
+   DEEP_RESEARCH_SELECTORS,
+   DEEP_RESEARCH_LINK_SELECTORS,
+   COMPUTED_SELECTORS,
+ } from './selectors/gemini';
```

```diff
# claude.ts
- const SELECTORS = { ... };
- const DEEP_RESEARCH_SELECTORS = { ... };
- const JOINED_SELECTORS = { ... };
+ import {
+   SELECTORS,
+   DEEP_RESEARCH_SELECTORS,
+   JOINED_SELECTORS,
+ } from './selectors/claude';
```

```diff
# chatgpt.ts
- const SELECTORS = { ... };
+ import { SELECTORS } from './selectors/chatgpt';
```

```diff
# perplexity.ts
- const SELECTORS = { ... };
+ import { SELECTORS } from './selectors/perplexity';
```

ロジック変更なし。参照名 (`SELECTORS.conversationTurn` 等) はすべて同一のまま。

#### 1.6 — 検証

- `npm run build` — TypeScript コンパイル成功
- `npm run test` — 既存テスト全件パス (テストは SELECTORS を参照していないため変更不要)
- `npm run lint` — lint エラーなし

---

### Phase 2: 認証プロファイル管理

#### 2.1 — ディレクトリ構造

```
e2e/
├── auth/
│   ├── setup-profile.ts      # 手動ログイン用ブラウザ起動
│   └── profiles/              # gitignored: 認証済みプロファイル保存先
├── selectors/
│   ├── smoke-test.spec.ts     # セレクタ検証テスト (プラットフォームごとに独立)
│   ├── obsidian-reporter.ts   # Custom Reporter: 結果集約 + Obsidian 通知 (ADR-006)
│   ├── report-builder.ts      # ValidationReport 構築の純粋関数
│   ├── auth-check.ts          # 認証状態プリフライトチェック
│   ├── baseline.ts            # ベースライン管理
│   ├── classifier.ts          # 結果分類ロジック
│   └── notifier.ts            # Obsidian 通知
├── results/                   # gitignored: 実行結果 (タイムスタンプ付き)
├── baselines/                 # gitignored: ベースラインデータ
├── .env.local                 # gitignored: テスト用会話 URL + Obsidian設定
├── .env.local.example         # テンプレート (gittracked)
├── tsconfig.json              # e2e 用 TypeScript 設定
└── playwright.config.ts
```

#### 2.2 — e2e/tsconfig.json

```json
{
  "extends": "../tsconfig.json",
  "compilerOptions": {
    "types": ["node"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "noEmit": true
  },
  "include": ["**/*.ts", "../src/content/extractors/selectors/**/*.ts"],
  "exclude": ["node_modules"]
}
```

Note: `chrome` 型は除外。Node.js + Playwright 環境に特化。

#### 2.3 — 認証セットアップスクリプト

```typescript
// e2e/auth/setup-profile.ts

import { chromium } from 'playwright';
import path from 'path';
import readline from 'readline';

const PROFILE_DIR = path.join(__dirname, 'profiles');
const TARGET_URLS = [
  'https://gemini.google.com',
  'https://claude.ai',
  'https://chatgpt.com',
  'https://www.perplexity.ai',
];

async function setupProfile(): Promise<void> {
  console.log('=== G2O Selector Validation: Auth Setup ===\n');
  console.log('A browser will open with 4 tabs.');
  console.log('Please log in to ALL platforms, then press Enter in this terminal.\n');

  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    channel: 'chromium',
    headless: false,
    viewport: { width: 1280, height: 800 },
  });

  for (const url of TARGET_URLS) {
    const page = await context.newPage();
    await page.goto(url);
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  await new Promise<void>((resolve) => {
    rl.question('\nPress Enter after logging in to all platforms...', () => {
      rl.close();
      resolve();
    });
  });

  await context.close();
  console.log(`\nProfile saved to: ${PROFILE_DIR}`);
  console.log('Re-run this script when sessions expire (typically every 1-2 weeks).');
}

setupProfile();
```

#### 2.4 — テスト用 URL 管理

```bash
# e2e/.env.local.example (gittracked)
# Copy to .env.local and fill in your conversation URLs.
# URLs only — no secrets or credentials.

# Gemini
GEMINI_CONV_URL=https://gemini.google.com/app/YOUR_CONVERSATION_ID
GEMINI_DR_URL=https://gemini.google.com/deepresearch/YOUR_DR_ID

# Claude
CLAUDE_CONV_URL=https://claude.ai/chat/YOUR_CONVERSATION_ID
CLAUDE_DR_URL=https://claude.ai/chat/YOUR_DR_CONVERSATION_ID

# ChatGPT
CHATGPT_CONV_URL=https://chatgpt.com/c/YOUR_CONVERSATION_ID

# Perplexity
PERPLEXITY_CONV_URL=https://www.perplexity.ai/search/YOUR_SEARCH_ID

# Obsidian notification
OBSIDIAN_URL=http://127.0.0.1:27123
OBSIDIAN_API_KEY=YOUR_API_KEY
OBSIDIAN_VAULT_PATH=AI/selector-health
```

---

### Phase 3: セレクタ Smoke Test

#### 3.1 — 認証状態プリフライトチェック (R-02 対応)

ナビゲーション後の URL を検証し、ログインページへのリダイレクトを検知する。

```typescript
// e2e/selectors/auth-check.ts

/**
 * プラットフォームごとの認証済み URL パターン
 * ナビゲーション後の URL がこのパターンに一致しなければ AUTH_EXPIRED
 */
const AUTH_URL_PATTERNS: Record<string, RegExp> = {
  gemini: /^https:\/\/gemini\.google\.com\/(app|deepresearch)\//,
  claude: /^https:\/\/claude\.ai\/chat\//,
  chatgpt: /^https:\/\/chatgpt\.com\/c\//,
  perplexity: /^https:\/\/www\.perplexity\.ai\/search\//,
};

export type AuthStatus = 'authenticated' | 'auth_expired' | 'unreachable';

/**
 * ナビゲーション後の URL をチェックして認証状態を判定
 *
 * - 会話 URL にとどまっていれば authenticated
 * - ログインページにリダイレクトされていれば auth_expired
 * - ナビゲーション自体が失敗すれば unreachable
 */
export async function checkAuthStatus(
  page: import('playwright').Page,
  platform: string,
  targetUrl: string,
): Promise<AuthStatus> {
  try {
    const response = await page.goto(targetUrl, {
      waitUntil: 'networkidle',
      timeout: 30_000,
    });

    if (!response || response.status() >= 400) {
      return 'unreachable';
    }

    const currentUrl = page.url();
    const pattern = AUTH_URL_PATTERNS[platform];

    if (pattern && pattern.test(currentUrl)) {
      return 'authenticated';
    }

    return 'auth_expired';
  } catch {
    return 'unreachable';
  }
}
```

#### 3.2 — ページロード待機戦略 (R-03 対応)

ハードコードの `waitForTimeout(3000)` を廃止。`networkidle` + 主要セレクタの `waitForSelector()` の組み合わせで、DOM が実際にレンダリングされたことを確認する。

各プラットフォームの「ページ準備完了」を示すセレクタ (`READY_SELECTORS`) を定義し、`waitForSelector()` で出現を待つ。セレクタ定義は Section 3.6 のテスト本体に一元化する。

#### 3.3 — ベースライン管理 (T-01 対応)

初回実行時のマッチ数をベースラインとして保存し、以降はベースラインとの乖離を検知する。

```typescript
// e2e/selectors/baseline.ts

import fs from 'fs';
import path from 'path';

const BASELINE_DIR = path.join(__dirname, '..', 'baselines');

export interface BaselineEntry {
  platform: string;
  group: string;
  name: string;
  selector: string;
  index: number;
  matchCount: number;
}

export type BaselineData = Record<string, BaselineEntry[]>; // key: platform

/**
 * ベースラインファイルのパス
 */
function baselinePath(platform: string): string {
  return path.join(BASELINE_DIR, `${platform}.json`);
}

/**
 * ベースラインが存在するか
 */
export function hasBaseline(platform: string): boolean {
  return fs.existsSync(baselinePath(platform));
}

/**
 * ベースラインを保存 (初回実行時)
 */
export function saveBaseline(platform: string, entries: BaselineEntry[]): void {
  if (!fs.existsSync(BASELINE_DIR)) {
    fs.mkdirSync(BASELINE_DIR, { recursive: true });
  }
  fs.writeFileSync(baselinePath(platform), JSON.stringify(entries, null, 2));
}

/**
 * ベースラインを読み込み
 */
export function loadBaseline(platform: string): BaselineEntry[] {
  const filePath = baselinePath(platform);
  if (!fs.existsSync(filePath)) return [];
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

/**
 * 現在の結果とベースラインを比較
 *
 * 判定ロジック:
 * - ベースラインに存在しない新規セレクタ → 比較不可 (スキップ)
 * - ベースライン matchCount > 0 → 現在も > 0 が必要
 * - ベースライン matchCount が N → 現在が 0 は FAIL
 * - primary (index=0) のマッチ喪失 → WARN (fallback でカバーされていても)
 */
export interface BaselineComparison {
  name: string;
  baselineCount: number;
  currentCount: number;
  status: 'match' | 'degraded' | 'lost' | 'new_selector';
}

export function compareWithBaseline(
  current: BaselineEntry[],
  baseline: BaselineEntry[],
): BaselineComparison[] {
  const comparisons: BaselineComparison[] = [];

  for (const base of baseline) {
    const curr = current.find(
      (c) => c.group === base.group && c.name === base.name && c.index === base.index,
    );

    if (!curr) continue;

    let status: 'match' | 'degraded' | 'lost';
    if (curr.matchCount > 0 && base.matchCount > 0) {
      status = 'match';
    } else if (curr.matchCount === 0 && base.matchCount > 0) {
      status = 'lost';
    } else {
      status = curr.matchCount >= base.matchCount ? 'match' : 'degraded';
    }

    comparisons.push({
      name: `${base.group}:${base.name}[${base.index}]`,
      baselineCount: base.matchCount,
      currentCount: curr.matchCount,
      status,
    });
  }

  // NEW-04: ベースラインに存在しない新規セレクタを検知
  const newSelectors = current.filter(
    (c) => !baseline.some(
      (b) => b.group === c.group && b.name === c.name && b.index === c.index,
    ),
  );
  for (const ns of newSelectors) {
    comparisons.push({
      name: `${ns.group}:${ns.name}[${ns.index}]`,
      baselineCount: -1, // ベースラインに存在しない
      currentCount: ns.matchCount,
      status: 'new_selector',
    });
  }

  if (newSelectors.length > 0) {
    console.warn(
      `${current[0]?.platform ?? 'unknown'}: ${newSelectors.length} new selector(s) not in baseline. ` +
      `Consider regenerating baseline with: rm e2e/baselines/${current[0]?.platform ?? '*'}.json && npm run e2e:selectors`,
    );
  }

  return comparisons;
}
```

#### 3.4 — 結果分類ロジック (T-04, T-05 対応)

```typescript
// e2e/selectors/classifier.ts

import type { BaselineComparison } from './baseline';

export interface SelectorResult {
  platform: string;
  group: string;
  name: string;
  selector: string;
  index: number;        // 0 = primary, 1+ = fallback
  matchCount: number;
}

export interface WarnDetail {
  /** 失敗した primary セレクタ */
  failedPrimary: SelectorResult;
  /** マッチした fallback セレクタ */
  workingFallback: SelectorResult;
}

export interface ClassificationResult {
  pass: SelectorResult[];
  warn: WarnDetail[];
  fail: SelectorResult[]; // primary の情報を含む
  baselineIssues: BaselineComparison[];
}

/**
 * 結果を分類
 *
 * - PASS: primary (index=0) がマッチ
 * - WARN: primary 失敗だが fallback がマッチ (T-04: 両方の情報を保持)
 * - FAIL: 全セレクタがマッチしない
 */
export function classifyResults(
  results: SelectorResult[],
  baselineComparisons: BaselineComparison[] = [],
): ClassificationResult {
  // name でグループ化
  const byName = new Map<string, SelectorResult[]>();
  for (const r of results) {
    const key = `${r.platform}:${r.group}:${r.name}`;
    const list = byName.get(key) ?? [];
    list.push(r);
    byName.set(key, list);
  }

  const pass: SelectorResult[] = [];
  const warn: WarnDetail[] = [];
  const fail: SelectorResult[] = [];

  for (const [, items] of byName) {
    const primary = items[0];
    const anyMatch = items.some((i) => i.matchCount > 0);

    if (primary.matchCount > 0) {
      pass.push(primary);
    } else if (anyMatch) {
      const fallback = items.find((i) => i.matchCount > 0)!;
      warn.push({
        failedPrimary: primary,
        workingFallback: fallback,
      });
    } else {
      fail.push(primary); // primary のメタデータを含める
    }
  }

  // ベースライン比較で lost になったものを追加の fail として扱う
  const baselineIssues = baselineComparisons.filter((c) => c.status !== 'match');

  return { pass, warn, fail, baselineIssues };
}
```

#### 3.5 — Playwright 設定

```typescript
// e2e/playwright.config.ts

import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './selectors',
  timeout: 90_000,          // 各テスト 90秒 (ナビゲーション + 認証チェック + 検証)
  retries: 1,               // 1回リトライ (ネットワーク一時障害対策)
  // NEW-01: sequential 実行 (workers: 1)
  // launchPersistentContext はプロファイルディレクトリに排他ロックを取得するため、
  // 同一ディレクトリで複数インスタンスを並列起動できない。
  // 各 describe は独立しているため、1 プラットフォームの障害は他をブロックしない。
  workers: 1,
  reporter: [
    ['list'],
    ['json', { outputFile: 'e2e/results/report.json' }],
  ],
  // NEW-02: テスト完了後に JSON レポートを読み取り → Obsidian 通知
  globalTeardown: './selectors/global-teardown.ts',
  // Note: launchPersistentContext は test fixture 内で直接呼び出す
  // defineConfig の use.launchOptions は BrowserContext 共有に使わない
});
```

#### 3.6 — Smoke Test 本体 (O-01 対応: プラットフォーム分離)

各プラットフォームを独立した `test.describe` で分離し、sequential に実行する。
`workers: 1` でプロファイルロック競合を回避しつつ、各 describe が独立した BrowserContext を使用するため、1 プラットフォームの失敗やタイムアウトが他の検証をブロックしない。

```typescript
// e2e/selectors/smoke-test.spec.ts

import { test, expect, chromium } from '@playwright/test';
import type { BrowserContext, Page } from 'playwright';
import path from 'path';
import dotenv from 'dotenv';
import {
  GEMINI_SELECTORS, GEMINI_DR_SELECTORS, GEMINI_DR_LINK_SELECTORS,
  CLAUDE_SELECTORS, CLAUDE_DR_SELECTORS,
  CHATGPT_SELECTORS,
  PERPLEXITY_SELECTORS,
} from '../../src/content/extractors/selectors';
import type { SelectorGroup } from '../../src/content/extractors/selectors/types';
import { checkAuthStatus, type AuthStatus } from './auth-check';
import { hasBaseline, saveBaseline, loadBaseline, compareWithBaseline } from './baseline';
import { classifyResults, type SelectorResult } from './classifier';

dotenv.config({ path: path.join(__dirname, '..', '.env.local') });

const PROFILE_DIR = path.join(__dirname, '..', 'auth', 'profiles');

// --- Helper Functions ---

/**
 * ページ上で全セレクタを検証し結果を返す
 */
async function validateSelectors(
  page: Page,
  platform: string,
  groupName: string,
  selectors: SelectorGroup,
): Promise<SelectorResult[]> {
  const results: SelectorResult[] = [];

  for (const [name, selectorList] of Object.entries(selectors)) {
    for (let i = 0; i < selectorList.length; i++) {
      const selector = selectorList[i];
      const matchCount = await page.evaluate(
        (sel: string) => document.querySelectorAll(sel).length,
        selector,
      );
      results.push({ platform, group: groupName, name, selector, index: i, matchCount });
    }
  }

  return results;
}

/**
 * 1 プラットフォーム × 1 ページの検証を実行
 */
async function runPlatformValidation(
  context: BrowserContext,
  platform: string,
  url: string | undefined,
  readyKey: string,
  selectorGroups: Record<string, SelectorGroup>,
): Promise<void> {
  // URL 未設定チェック
  expect(url, `${platform}: URL not configured in .env.local`).toBeTruthy();

  const page = await context.newPage();
  try {
    // 認証プリフライトチェック (R-02)
    const authStatus: AuthStatus = await checkAuthStatus(page, platform, url!);

    if (authStatus === 'unreachable') {
      test.skip(true, `${platform}: site unreachable`);
      return;
    }
    if (authStatus === 'auth_expired') {
      test.skip(true, `${platform}: AUTH_EXPIRED — run 'npm run e2e:auth' to re-login`);
      return;
    }

    // ページ準備完了待ち (R-03: networkidle + waitForSelector)
    const readySelector = READY_SELECTORS[readyKey];
    if (readySelector) {
      try {
        await page.waitForSelector(readySelector, { timeout: 15_000 });
      } catch {
        // ready セレクタ自体が壊れている可能性 → 検証は続行
        console.warn(`${platform}: ready selector '${readySelector}' not found, proceeding anyway`);
      }
    }

    // 全セレクタ検証
    const allResults: SelectorResult[] = [];
    for (const [groupName, selectors] of Object.entries(selectorGroups)) {
      const results = await validateSelectors(page, platform, groupName, selectors);
      allResults.push(...results);
    }

    // ベースライン比較 (T-01)
    let baselineComparisons;
    if (hasBaseline(platform)) {
      const baseline = loadBaseline(platform);
      baselineComparisons = compareWithBaseline(allResults, baseline);
    } else {
      // 初回実行: ベースラインを保存
      saveBaseline(platform, allResults);
      console.log(`${platform}: baseline saved (first run)`);
    }

    // 結果分類
    const classified = classifyResults(allResults, baselineComparisons);

    // 結果をアノテーションに記録
    test.info().annotations.push(
      { type: 'pass', description: String(classified.pass.length) },
      { type: 'warn', description: String(classified.warn.length) },
      { type: 'fail', description: String(classified.fail.length) },
      { type: 'baseline_issues', description: String(classified.baselineIssues.length) },
    );

    // アサーション (T-05: expect() を使用)
    expect(
      classified.fail,
      `${platform}: selectors with zero matches: ${classified.fail.map((f) => `${f.group}:${f.name}`).join(', ')}`,
    ).toHaveLength(0);

  } finally {
    await page.close();
  }
}

// --- Ready Selectors (R-03) ---
// 各プラットフォームの「ページ準備完了」を示すセレクタ
// checkAuthStatus() の networkidle 後に waitForSelector() で出現を待つ

const READY_SELECTORS: Record<string, string> = {
  gemini_conv: '.conversation-container',
  gemini_dr: 'deep-research-immersive-panel',
  claude_conv: '.font-claude-response',
  claude_dr: '#markdown-artifact',
  chatgpt_conv: 'section[data-turn-id]',
  perplexity_conv: 'div[id^="markdown-content-"]',
};

// --- Test Definitions (O-01: プラットフォーム分離) ---
// Sequential 実行 (workers: 1, playwright.config.ts で設定)
// 各 describe は独立した BrowserContext を使用

test.describe('Gemini', () => {
  let context: BrowserContext;

  test.beforeAll(async () => {
    context = await chromium.launchPersistentContext(PROFILE_DIR, {
      channel: 'chromium',
      headless: true,
    });
  });

  test.afterAll(async () => { await context.close(); });

  test('conversation selectors', async () => {
    await runPlatformValidation(context, 'gemini', process.env.GEMINI_CONV_URL, 'gemini_conv', {
      SELECTORS: GEMINI_SELECTORS,
    });
  });

  test('deep research selectors', async () => {
    await runPlatformValidation(context, 'gemini', process.env.GEMINI_DR_URL, 'gemini_dr', {
      DEEP_RESEARCH_SELECTORS: GEMINI_DR_SELECTORS,
      DEEP_RESEARCH_LINK_SELECTORS: GEMINI_DR_LINK_SELECTORS,
    });
  });
});

test.describe('Claude', () => {
  let context: BrowserContext;

  test.beforeAll(async () => {
    context = await chromium.launchPersistentContext(PROFILE_DIR, {
      channel: 'chromium',
      headless: true,
    });
  });

  test.afterAll(async () => { await context.close(); });

  test('conversation selectors', async () => {
    await runPlatformValidation(context, 'claude', process.env.CLAUDE_CONV_URL, 'claude_conv', {
      SELECTORS: CLAUDE_SELECTORS,
    });
  });

  test('deep research selectors', async () => {
    await runPlatformValidation(context, 'claude', process.env.CLAUDE_DR_URL, 'claude_dr', {
      DEEP_RESEARCH_SELECTORS: CLAUDE_DR_SELECTORS,
    });
  });
});

test.describe('ChatGPT', () => {
  let context: BrowserContext;

  test.beforeAll(async () => {
    context = await chromium.launchPersistentContext(PROFILE_DIR, {
      channel: 'chromium',
      headless: true,
    });
  });

  test.afterAll(async () => { await context.close(); });

  test('conversation selectors', async () => {
    await runPlatformValidation(context, 'chatgpt', process.env.CHATGPT_CONV_URL, 'chatgpt_conv', {
      SELECTORS: CHATGPT_SELECTORS,
    });
  });
});

test.describe('Perplexity', () => {
  let context: BrowserContext;

  test.beforeAll(async () => {
    context = await chromium.launchPersistentContext(PROFILE_DIR, {
      channel: 'chromium',
      headless: true,
    });
  });

  test.afterAll(async () => { await context.close(); });

  test('conversation selectors', async () => {
    await runPlatformValidation(context, 'perplexity', process.env.PERPLEXITY_CONV_URL, 'perplexity_conv', {
      SELECTORS: PERPLEXITY_SELECTORS,
    });
  });
});
```

#### 3.7 — Global Teardown: テスト結果集約 → 通知パイプライン (NEW-02 対応)

全テスト完了後に Playwright の JSON レポートを読み取り、`ValidationReport` を構築して Obsidian に通知する。

```typescript
// e2e/selectors/global-teardown.ts

import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { notifyObsidian } from './notifier';
import type { ClassificationResult } from './classifier';
import type { AuthStatus } from './auth-check';

dotenv.config({ path: path.join(__dirname, '..', '.env.local') });

interface PlaywrightTestResult {
  title: string;
  status: 'passed' | 'failed' | 'skipped' | 'timedOut';
  annotations: Array<{ type: string; description: string }>;
}

interface PlaywrightSuite {
  title: string;
  specs: Array<{ title: string; tests: PlaywrightTestResult[] }>;
  suites?: PlaywrightSuite[];
}

interface PlaywrightReport {
  suites: PlaywrightSuite[];
}

/**
 * Playwright JSON レポートからアノテーションを抽出し
 * ValidationReport を構築
 */
async function globalTeardown(): Promise<void> {
  const reportPath = path.join(__dirname, '..', 'results', 'report.json');

  if (!fs.existsSync(reportPath)) {
    console.error('No report.json found. Skipping notification.');
    return;
  }

  const report: PlaywrightReport = JSON.parse(fs.readFileSync(reportPath, 'utf-8'));
  const timestamp = new Date().toISOString();

  // タイムスタンプ付きレポートを保存 (O-05)
  const dateStr = timestamp.slice(0, 10);
  const timestampedPath = path.join(__dirname, '..', 'results', `report-${dateStr}.json`);
  fs.copyFileSync(reportPath, timestampedPath);

  // プラットフォームごとの結果を集約
  const platforms = extractPlatformResults(report);

  // overallStatus の判定
  const hasAuthExpired = platforms.some((p) => p.authStatus === 'auth_expired');
  const hasFail = platforms.some((p) => p.testStatus === 'failed');
  const hasWarn = platforms.some((p) => {
    const warnCount = parseInt(p.annotations.warn ?? '0', 10);
    return warnCount > 0;
  });

  let overallStatus: 'pass' | 'warn' | 'fail' | 'auth_expired';
  if (hasFail) overallStatus = 'fail';
  else if (hasAuthExpired) overallStatus = 'auth_expired';
  else if (hasWarn) overallStatus = 'warn';
  else overallStatus = 'pass';

  // Obsidian 通知
  const obsidianUrl = process.env.OBSIDIAN_URL ?? 'http://127.0.0.1:27123';
  const obsidianApiKey = process.env.OBSIDIAN_API_KEY;
  const vaultPath = process.env.OBSIDIAN_VAULT_PATH ?? 'AI/selector-health';

  if (!obsidianApiKey) {
    console.warn('OBSIDIAN_API_KEY not set in .env.local. Skipping Obsidian notification.');
    return;
  }

  await notifyObsidian(
    { timestamp, platforms: buildPlatformReports(platforms), overallStatus },
    { obsidianUrl, obsidianApiKey, vaultPath },
  );
}

// Helper: Playwright レポートからプラットフォーム結果を抽出
// (実装の詳細は省略 — suites を再帰的に走査し、
//  annotations の pass/warn/fail/baseline_issues カウントを収集する)

export default globalTeardown;
```

**パイプライン概要** (ADR-006 で改訂: globalTeardown → Custom Reporter):

```
テスト実行中
  ↓
ObsidianReporter.onTestEnd() が各テスト完了時に呼ばれる
  ├─ test.parent.title からプラットフォーム名を抽出
  ├─ result.annotations からカウントを取得
  └─ プラットフォームマップに蓄積
  ↓
全テスト完了
  ↓
ObsidianReporter.onEnd() が呼ばれる
  ├─ 蓄積データから ValidationReport を構築
  ├─ タイムスタンプ付き JSON を保存 (report-YYYY-MM-DD.json)
  ├─ overallStatus 判定 (fail > auth_expired > warn > pass)
  └─ notifyObsidian() で Obsidian にノート作成 (pass 以外の場合)
```

#### 3.8 — classifier / baseline のユニットテスト (T-02 対応)

```typescript
// e2e/selectors/__tests__/classifier.test.ts (vitest)

import { describe, it, expect } from 'vitest';
import { classifyResults, type SelectorResult } from '../classifier';

// テストケース:
// 1. 全セレクタ pass (primary マッチ)
// 2. Primary 失敗 + fallback マッチ → WARN (failedPrimary + workingFallback)
// 3. 全セレクタ不一致 → FAIL
// 4. 空入力
// 5. 単一セレクタグループ (fallback なし)
// 6. ベースライン比較で lost
```

ロジックの正当性を検証するため、vitest でユニットテストを作成する。
Playwright テストとは別の実行パス (`npm run test` で実行される)。

#### 3.9 — セレクタ検証フロー

```
┌─────────────────────────────────────────────────────────────────┐
│ Smoke Test Flow (sequential, workers: 1)                        │
│                                                                 │
│ Per platform (Gemini → Claude → ChatGPT → Perplexity):          │
│                                                                 │
│  1. launchPersistentContext(profiles/)                           │
│     └─ 排他ロックのため sequential (同時に 1 インスタンスのみ)   │
│                                                                 │
│  2. 認証プリフライトチェック                                     │
│     ├─ page.goto(url, { waitUntil: 'networkidle' })             │
│     ├─ 現在の URL を AUTH_URL_PATTERNS と照合                    │
│     ├─ AUTH_EXPIRED → test.skip + メッセージ                    │
│     └─ UNREACHABLE → test.skip + メッセージ                    │
│                                                                 │
│  3. ページ準備完了待機                                          │
│     └─ waitForSelector(READY_SELECTORS[key], { timeout: 15s }) │
│                                                                 │
│  4. page.evaluate() で各セレクタを querySelectorAll()            │
│     └─ shared selector modules から直接 import                  │
│     └─ 各セレクタのマッチ数を記録                                │
│                                                                 │
│  5. ベースライン比較                                            │
│     ├─ 初回: ベースライン保存                                   │
│     └─ 2回目以降: 乖離検知 (lost / degraded / match /           │
│                                new_selector)                    │
│                                                                 │
│  6. 結果を分類                                                  │
│     ├─ ✅ PASS: primary selector がマッチ                       │
│     ├─ ⚠️ WARN: fallback のみマッチ (primary + fallback 情報)   │
│     └─ ❌ FAIL: 全セレクタ不一致 (primary 情報を含む)            │
│                                                                 │
│  7. expect(fail).toHaveLength(0) でアサーション                  │
│                                                                 │
│  8. context.close() → 次のプラットフォームへ                     │
│                                                                 │
│ 全プラットフォーム完了後:                                        │
│                                                                 │
│  9. globalTeardown 起動                                          │
│     ├─ report.json を読み取り                                    │
│     ├─ report-YYYY-MM-DD.json にコピー保存                       │
│     ├─ ValidationReport を構築                                   │
│     └─ notifyObsidian() (pass 以外の場合)                        │
└─────────────────────────────────────────────────────────────────┘
```

---

### Phase 4: 通知システム

#### 4.1 — Obsidian 通知

検証結果を Obsidian Local REST API 経由でノートとして保存する。WARN または FAIL が 1 つでもあれば通知。

```typescript
// e2e/selectors/notifier.ts

import type { ClassificationResult, SelectorResult } from './classifier';
import type { AuthStatus } from './auth-check';
import type { BaselineComparison } from './baseline';

interface NotificationConfig {
  obsidianUrl: string;
  obsidianApiKey: string;
  vaultPath: string;
}

interface PlatformReport {
  platform: string;
  authStatus: AuthStatus;
  classification?: ClassificationResult;
}

interface ValidationReport {
  timestamp: string;
  platforms: PlatformReport[];
  overallStatus: 'pass' | 'warn' | 'fail' | 'auth_expired';
}

/**
 * Obsidian にレポートノートを作成
 * WARN / FAIL / AUTH_EXPIRED がある場合のみ通知
 */
export async function notifyObsidian(
  report: ValidationReport,
  config: NotificationConfig,
): Promise<void> {
  if (report.overallStatus === 'pass') {
    console.log('All selectors passed. No notification needed.');
    return;
  }

  const markdown = generateMarkdown(report);
  const dateStr = report.timestamp.slice(0, 10);
  const fileName = `selector-health-${dateStr}.md`;
  const notePath = `${config.vaultPath}/${fileName}`;

  const response = await fetch(
    `${config.obsidianUrl}/vault/${encodeURIComponent(notePath)}`,
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'text/markdown',
        Authorization: `Bearer ${config.obsidianApiKey}`,
      },
      body: markdown,
    },
  );

  if (!response.ok) {
    console.error(`Obsidian notification failed: ${response.status} ${response.statusText}`);
  } else {
    console.log(`Obsidian notification sent: ${notePath}`);
  }
}

function generateMarkdown(report: ValidationReport): string {
  const dateStr = report.timestamp.slice(0, 10);
  const lines: string[] = [
    '---',
    `date: "${report.timestamp}"`,
    `status: ${report.overallStatus}`,
    'tags: [selector-health, automated]',
    '---',
    '',
    `# Selector Health Report - ${dateStr}`,
    '',
    `**Overall: ${report.overallStatus.toUpperCase()}**`,
    '',
    '## Summary',
    '',
    '| Platform | Auth | Pass | Warn | Fail | Baseline |',
    '|----------|------|------|------|------|----------|',
  ];

  for (const p of report.platforms) {
    if (p.authStatus !== 'authenticated' || !p.classification) {
      const authIcon = p.authStatus === 'auth_expired' ? '🔑 EXPIRED' : '🔌 DOWN';
      lines.push(`| ${p.platform} | ${authIcon} | - | - | - | - |`);
    } else {
      const c = p.classification;
      lines.push(
        `| ${p.platform} | ✅ | ${c.pass.length} | ${c.warn.length} | ${c.fail.length} | ${c.baselineIssues.length} |`,
      );
    }
  }

  lines.push('');

  // WARN / FAIL / AUTH_EXPIRED の詳細
  for (const p of report.platforms) {
    if (p.authStatus !== 'authenticated') {
      lines.push(`## ${p.platform} — ${p.authStatus === 'auth_expired' ? '🔑 Authentication Expired' : '🔌 Unreachable'}`);
      lines.push('');
      lines.push(`Run \`npm run e2e:auth\` to re-authenticate.`);
      lines.push('');
      continue;
    }

    if (!p.classification) continue;
    const c = p.classification;

    if (c.warn.length === 0 && c.fail.length === 0 && c.baselineIssues.length === 0) continue;

    lines.push(`## ${p.platform}`);
    lines.push('');

    if (c.warn.length > 0) {
      lines.push('### ⚠️ Warnings (primary failed, fallback OK)');
      lines.push('');
      lines.push('| Name | Failed Primary | Working Fallback | Fallback Matches |');
      lines.push('|------|----------------|------------------|------------------|');
      for (const w of c.warn) {
        lines.push(
          `| ${w.failedPrimary.group}:${w.failedPrimary.name} | \`${w.failedPrimary.selector}\` | \`${w.workingFallback.selector}\` | ${w.workingFallback.matchCount} |`,
        );
      }
      lines.push('');
    }

    if (c.fail.length > 0) {
      lines.push('### ❌ Failures (all selectors broken)');
      lines.push('');
      lines.push('| Name | Primary Selector |');
      lines.push('|------|------------------|');
      for (const f of c.fail) {
        lines.push(`| ${f.group}:${f.name} | \`${f.selector}\` |`);
      }
      lines.push('');
    }

    if (c.baselineIssues.length > 0) {
      lines.push('### 📉 Baseline Degradation');
      lines.push('');
      lines.push('| Selector | Baseline | Current | Status |');
      lines.push('|----------|----------|---------|--------|');
      for (const b of c.baselineIssues) {
        lines.push(`| ${b.name} | ${b.baselineCount} | ${b.currentCount} | ${b.status} |`);
      }
      lines.push('');
    }
  }

  return lines.join('\n');
}
```

#### 4.2 — 結果ファイルの保存 (O-05 対応)

レポート JSON はタイムスタンプ付きで保存し、履歴を残す。

```
e2e/results/
├── report-2026-03-21.json
├── report-2026-03-22.json
└── ...
```

---

### Phase 5: 日次スケジュール実行

#### 5.1 — npm scripts

```json
{
  "scripts": {
    "e2e:auth": "npx tsx e2e/auth/setup-profile.ts",
    "e2e:selectors": "npx playwright test --config e2e/playwright.config.ts",
    "e2e:selectors:headed": "npx playwright test --config e2e/playwright.config.ts --headed"
  }
}
```

#### 5.2 — launchd plist (macOS 日次実行)

```xml
<!-- ~/Library/LaunchAgents/com.g2o.selector-check.plist -->
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.g2o.selector-check</string>
  <key>ProgramArguments</key>
  <array>
    <string>/opt/homebrew/bin/npm</string>
    <string>run</string>
    <string>e2e:selectors</string>
  </array>
  <key>WorkingDirectory</key>
  <string>/Volumes/dev/src/javascript/work/gemini2obsidian</string>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key>
    <integer>9</integer>
    <key>Minute</key>
    <integer>0</integer>
  </dict>
  <key>StandardOutPath</key>
  <string>/tmp/g2o-selector-check.log</string>
  <key>StandardErrorPath</key>
  <string>/tmp/g2o-selector-check.err</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
  </dict>
</dict>
</plist>
```

Note: launchd はマシンがスリープ中にスケジュール時刻を過ぎた場合、ウェイク後に実行する。

```bash
# 登録
launchctl load ~/Library/LaunchAgents/com.g2o.selector-check.plist

# 解除
launchctl unload ~/Library/LaunchAgents/com.g2o.selector-check.plist

# 即時実行 (テスト用)
launchctl start com.g2o.selector-check
```

---

## Getting Started (E-03 対応)

初回セットアップ手順:

```bash
# 1. Playwright インストール
npm install -D @playwright/test dotenv
npx playwright install chromium

# 2. 認証プロファイル作成 (ブラウザが開き、手動で4サイトにログイン)
npm run e2e:auth

# 3. テスト URL 設定
cp e2e/.env.local.example e2e/.env.local
# → .env.local を開いて各プラットフォームの会話 URL を記入

# 4. 初回実行 (ベースライン保存)
npm run e2e:selectors

# 5. (オプション) 日次実行の登録
launchctl load ~/Library/LaunchAgents/com.g2o.selector-check.plist
```

---

## 具体的出力例 (E-01 対応)

### コンソール出力

```
$ npm run e2e:selectors

Running 7 tests using 1 worker

  ✓ [Gemini] conversation selectors (4.2s)
    pass: 7, warn: 0, fail: 0, baseline_issues: 0
  ✓ [Gemini] deep research selectors (3.8s)
    pass: 8, warn: 2, fail: 0, baseline_issues: 1
  ✓ [Claude] conversation selectors (3.5s)
    pass: 6, warn: 0, fail: 0, baseline_issues: 0
  ✓ [Claude] deep research selectors (3.1s)
    pass: 4, warn: 0, fail: 0, baseline_issues: 0
  ✗ [ChatGPT] conversation selectors (5.2s)
    pass: 3, warn: 0, fail: 1, baseline_issues: 1
    Expected: fail.length === 0
    Received: ["SELECTORS:conversationTurn"]
  - [Perplexity] conversation selectors (skipped)
    AUTH_EXPIRED — run 'npm run e2e:auth' to re-login

  5 passed, 1 failed, 1 skipped

  [globalTeardown] Building ValidationReport from report.json...
  [globalTeardown] Obsidian notification sent: AI/selector-health/selector-health-2026-03-21.md
```

### Obsidian ノート出力例 (E-02 対応)

```markdown
---
date: "2026-03-21T09:00:12Z"
status: fail
tags: [selector-health, automated]
---

# Selector Health Report - 2026-03-21

**Overall: FAIL**

## Summary

| Platform   | Auth       | Pass | Warn | Fail | Baseline |
|------------|------------|------|------|------|----------|
| Gemini     | ✅         | 15   | 2    | 0    | 1        |
| Claude     | ✅         | 10   | 0    | 0    | 0        |
| ChatGPT    | ✅         | 3    | 0    | 1    | 1        |
| Perplexity | 🔑 EXPIRED | -    | -    | -    | -        |

## Gemini

### ⚠️ Warnings (primary failed, fallback OK)

| Name | Failed Primary | Working Fallback | Fallback Matches |
|------|----------------|------------------|------------------|
| DEEP_RESEARCH_SELECTORS:title | `deep-research-immersive-panel h2.title-text.gds-title-s` | `deep-research-immersive-panel .title-text` | 1 |
| DEEP_RESEARCH_LINK_SELECTORS:sourceTitle | `[data-test-id="title"]` | `.sub-title` | 12 |

### 📉 Baseline Degradation

| Selector | Baseline | Current | Status |
|----------|----------|---------|--------|
| DEEP_RESEARCH_SELECTORS:title[0] | 1 | 0 | lost |

## ChatGPT

### ❌ Failures (all selectors broken)

| Name | Primary Selector |
|------|------------------|
| SELECTORS:conversationTurn | `section[data-turn-id]` |

### 📉 Baseline Degradation

| Selector | Baseline | Current | Status |
|----------|----------|---------|--------|
| SELECTORS:conversationTurn[0] | 8 | 0 | lost |

## Perplexity — 🔑 Authentication Expired

Run `npm run e2e:auth` to re-authenticate.
```

---

## .gitignore 追加項目

```gitignore
# E2E selector validation
e2e/auth/profiles/
e2e/.env.local
e2e/results/
e2e/baselines/
```

---

## 依存パッケージ追加

```bash
npm install -D @playwright/test dotenv
npx playwright install chromium
```

---

## 影響範囲まとめ

| 対象 | 変更内容 | リスク |
|------|---------|-------|
| `src/content/extractors/selectors/` | 新規作成 (6ファイル: types + 4 platforms + index) | なし |
| `src/content/extractors/gemini.ts` | SELECTORS 定義削除 + import 追加 | LOW |
| `src/content/extractors/claude.ts` | 同上 | LOW |
| `src/content/extractors/chatgpt.ts` | 同上 | LOW |
| `src/content/extractors/perplexity.ts` | 同上 | LOW |
| `e2e/` | 新規ディレクトリ (認証・テスト・通知・ベースライン) | なし |
| `e2e/tsconfig.json` | 新規: Node.js + Playwright 用 TS 設定 | なし |
| `package.json` | scripts 追加 + playwright/dotenv devDep | LOW |
| `.gitignore` | 4 エントリ追加 | なし |
| 既存テスト | 変更不要 | なし |

---

## 実装順序

```
Phase 1: セレクタ共有モジュール抽出 (standalone PR)
  ├─ 1.1 selectors/types.ts 作成
  ├─ 1.2 selectors/{gemini,claude,chatgpt,perplexity}.ts — ソースから as-is で移動
  ├─ 1.3 selectors/index.ts 作成
  ├─ 1.4 各 extractor から SELECTORS 定義を削除 + import 追加
  └─ 1.5 npm run build + npm run test + npm run lint で検証

Phase 2: 認証プロファイル管理
  ├─ 2.1 e2e/ ディレクトリ構造作成
  ├─ 2.2 e2e/tsconfig.json 作成
  ├─ 2.3 setup-profile.ts 作成
  └─ 2.4 .env.local.example 作成

Phase 3: Smoke Test
  ├─ 3.1 playwright.config.ts 作成 (workers: 1, globalTeardown)
  ├─ 3.2 auth-check.ts 作成 (認証プリフライト)
  ├─ 3.3 baseline.ts 作成 (ベースライン管理 + new_selector 検知)
  ├─ 3.4 classifier.ts 作成 (結果分類)
  ├─ 3.5 classifier / baseline のユニットテスト作成
  ├─ 3.6 smoke-test.spec.ts 作成 (sequential 実行)
  └─ 3.7 headed モードで手動実行・動作確認

Phase 4: 通知システム
  ├─ 4.1 notifier.ts 作成 (Obsidian REST API)
  ├─ 4.2 global-teardown.ts 作成 (JSON レポート集約 → 通知)
  └─ 4.3 通知の動作確認

Phase 5: スケジュール実行
  ├─ 5.1 npm scripts 追加
  ├─ 5.2 launchd plist 作成
  └─ 5.3 日次実行の動作確認
```

---

## Review 対応状況

| ID | Issue | 対応 |
|----|-------|------|
| **R-01** | 全体の成功基準未定義 | ✅ 受入基準セクション追加 |
| **R-02** | 認証切れで誤 FAIL | ✅ auth-check.ts + AUTH_EXPIRED 判定 (URL パターン照合) |
| **R-03** | ハードコード 3s wait | ✅ networkidle + waitForSelector に変更 |
| **R-04** | URL 管理要件 | ✅ .env.local.example テンプレート追加 |
| **R-05** | セレクタ-ページマッピング | ✅ selectorGroups を conv/dr で分離して URL と対応 |
| **A-01** | セレクタ定義の不一致 | ✅ "extract as-is from source" + 行番号参照に変更 |
| **A-02** | SelectorGroup 型がキー喪失 | ✅ `as const satisfies SelectorGroup` パターン解説追加 |
| **A-03** | e2e→src 結合の文書化 | ✅ Phase 1 の設計意図として明記 |
| **A-04** | e2e/tsconfig 未定義 | ✅ e2e/tsconfig.json 追加 |
| **A-05** | COMPUTED_SELECTORS の位置 | ✅ index.ts には含めない旨を明記 |
| **T-01** | matchCount>0 では不十分 | ✅ ベースライン比較方式 (案C) を採用 |
| **T-02** | classifier テスト未定義 | ✅ ユニットテストセクション追加 |
| **T-03** | 共有コンテキストリスク | ✅ プラットフォームごとに独立した BrowserContext |
| **T-04** | WARN で primary 情報欠落 | ✅ WarnDetail { failedPrimary, workingFallback } |
| **T-05** | test.fail() セマンティクス | ✅ expect(fail).toHaveLength(0) に変更 |
| **O-01** | プラットフォーム分離なし | ✅ 独立 describe + workers: 1 (sequential) |
| **O-02** | launchd 運用懸念 | ✅ スリープ時の挙動を Note として追記 |
| **O-03** | エスカレーション未定義 | Phase 2 以降の拡張 (初期実装スコープ外) |
| **O-04** | headless/headed 差異 | ✅ headless: true を採用 (ユーザー回答) |
| **O-05** | 履歴データ未保存 | ✅ タイムスタンプ付きレポートファイル |
| **E-01** | コンソール出力例なし | ✅ 具体的出力例セクション追加 |
| **E-02** | Obsidian ノート例なし | ✅ テーブル形式のサンプル追加 |
| **E-03** | Getting Started なし | ✅ Getting Started セクション追加 |
| **NEW-01** | persistent context ロック競合 | ✅ workers: 1 (sequential) に変更、parallel 削除 |
| **NEW-02** | 結果集約パイプライン未定義 | ✅ globalTeardown で JSON レポート読取 → Obsidian 通知 |
| **NEW-03** | READY_SELECTORS 重複定義 | ✅ Section 3.6 に一元化、3.2 から定義を削除 |
| **NEW-04** | 新規セレクタのベースライン検知 | ✅ `new_selector` ステータス追加 + 再生成ログ |

---

## 実装時の設計変更 (2026-03-22)

設計書 v3 (レビュー対応後) から実装完了までに、以下の設計変更が発生した。

### IMP-01: storageState 方式への転換

**設計時**: `launchPersistentContext(profiles/)` でプロファイルディレクトリを共有する方式
**実装時**: `storageState` (Cookie/localStorage の JSON エクスポート) + `browser.newContext()` で注入する方式に転換

**経緯**: `launchPersistentContext` + `channel: 'chrome'` で 3 つの問題が連鎖して発生した:

1. **Google ログインブロック**: Playwright は Chrome 起動時に `--enable-automation`, `--remote-debugging-pipe` 等のフラグを強制付与。Google がこれを検知し「このブラウザまたはアプリは安全でない可能性があります」としてログインを拒否
2. **SingletonLock 競合**: Chrome の `SingletonLock` はシンボリックリンク (`hostname-PID` をターゲット)。`fs.existsSync()` はリンク先を辿るため broken symlink を検出できず、stale lock の削除が機能しなかった
3. **Keychain 暗号化の不一致**: 通常の Chrome は macOS Keychain でトークンを暗号化。Playwright は `--password-store=basic --use-mock-keychain` を強制するため、Chrome プロファイルのトークンを復号できない (`Failed to decrypt token for service AccountId-...`)

**解決策**: プロファイルディレクトリの共有を完全に廃止。

```
認証セットアップ (e2e:auth):
  Chrome 直接起動 (--remote-debugging-port=9222, Playwright フラグなし)
  → ユーザーが手動ログイン
  → Playwright が connectOverCDP で接続
  → context.storageState({ path: 'state.json' }) でエクスポート
  → Chrome 終了

セレクタ検証 (e2e:selectors):
  Playwright chromium.launch({ channel: 'chrome' })  ← 新規インスタンス
  → browser.newContext({ storageState: 'state.json' }) ← Cookie 注入
  → 各プラットフォームにナビゲート + セレクタ検証
```

### IMP-02: Cloudflare bot 検知対策

**設計時**: `headless: true` を採用 (ユーザー回答 O-04)
**実装時**: `channel: 'chrome'` + `headless: false` (headed) に変更

**経緯**: Playwright の bundled Chromium (headless) で 3 サイト (Claude, ChatGPT, Perplexity) にアクセスすると、Cloudflare が bot として検知し 403 + "Just a moment..." チャレンジページを返した。Gemini のみ通過。

**解決策**: システムの Google Chrome (`channel: 'chrome'`) を headed モード (`headless: false`) で起動。Cloudflare の検知率が大幅に低下し、4 プラットフォームすべてで正常にアクセス可能。

### IMP-03: networkidle → domcontentloaded

**設計時**: `waitUntil: 'networkidle'` + `waitForSelector()` (R-03 対応)
**実装時**: `waitUntil: 'domcontentloaded'` + `waitForTimeout(3000)` + `waitForSelector()`

**経緯**: 4 プラットフォームすべてが SPA であり、WebSocket / SSE で常時通信を維持するため `networkidle` (500ms 間ネットワーク接続ゼロ) に到達せず全テストがタイムアウトした。

### IMP-04: 単一共有 BrowserContext

**設計時**: プラットフォームごとに独立した `BrowserContext` (T-03 対応)
**実装時**: 全プラットフォームで単一の `BrowserContext` を共有

**経緯**: storageState 方式ではプロファイルロック問題が存在しないため、分離の必要がない。単一 context で Cookie を共有し、各テストが `newPage()` → `page.close()` するだけで十分に分離される。

---

## 既知の残課題

| ID | 課題 | 優先度 | 対応方針 |
|----|------|--------|---------|
| ~~OPEN-01~~ | ~~`globalTeardown` で `report.json` が読めない~~ | **RESOLVED** | Custom Playwright Reporter (`obsidian-reporter.ts`) で解決。`onTestEnd()` でアノテーションを直接収集し `onEnd()` で通知。`report.json` への依存を排除。ADR-006 参照 |
| **OPEN-02** | launchd plist 未作成 | LOW | 手動実行 (`npm run e2e:selectors`) で機能確認済み。OPEN-01 解決済みのため着手可能 |
| **OPEN-03** | headed モードのディスプレイ依存 | LOW | launchd での自動実行にはディスプレイが必要。macOS ではログイン中なら問題なし |
