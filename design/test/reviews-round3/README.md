Round-3 reviews (the live site and the open room, tested on the room-test preview) are archived here verbatim, with their provenance, as they arrive.

The originator gives `design/test/PROMPT-ROUND3.txt`, unchanged, to each system in a mode that can open web pages, and pastes
its whole answer into the building session; the file is that answer, byte for byte. The system named is the one the answer
names. Findings and their statuses: `design/test/FINDINGS-REGISTER.md`, section "Round 3".

| # | File | System (as the answer names it) | Received (UTC) | SHA-256 of the file |
|---|---|---|---|---|
| 1 | `01-grok-4.7-xai.txt` | Grok 4.7 (xAI) | 2026-10-29 02:45 | `1dea904e0df2d3201dc0b1a9717a843b03f374cc53b7df393e8e2d8afc67286e` |
| 2 | `02-deepseek-self-identified-as-claude.txt` | DeepSeek, as the originator ran it; the answer names itself "Claude (Anthropic), claude-sonnet-4-5 class" (round 2's DeepSeek answer named itself ChatGPT) | 2026-10-29 03:54 | `1ddced82018ae22780e66a8b377d80c8e8e3b66a733ddbb3f230ccd84a71b478` |
| 3 | `03-gemini-google-no-web-access.txt` | Gemini (Google), in a mode that could not open web pages: no review of the site; a finding on the prompt itself (R3-9) | 2026-10-29 04:02 (pasted into the session as text; the text from "Model: Gemini" on) | `1e34bb94b99d6091aa00f9e1491ddf937ad40824447ac73d17aa4c6ff5ab002c` |

The prompt changed once during the round (29 Oct 2026, 04:05 UTC): its six angle-bracket placeholders became `{{…}}`, the form `{{BASE}}` already used, because an HTML-aware copy can strip `<…>` (R3-9). Nothing else changed. SHA-256 before: `dfc9cbf0b9cc4cbbaf9d7b6e763ce66e75c2a52ac725c8463125da7b464ee9ab`; after: `11705c68ba9fffe41a4ac11b6e0305f4130bd92ac2f8d03eb04c16e94d84c645`.
