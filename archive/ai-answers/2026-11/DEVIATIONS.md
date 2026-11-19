# Deviations from PROTOCOL.md (baseline 2026-11)

Every departure from the registered method (commit 1b501ab), gathered from the notes in each answer file and from the scoring. Nothing below was fixed by hand: the answer files are as committed, and the scores are in scores.json.

## 1. Scoring: the right answers

PROTOCOL.md says each answer is scored "against the 'right answer' column of the approved question set". prompts.json holds only the 21 prompts, and no approved question set with a right-answer column was found in the repository or in /home/claude/aiq. The answers were therefore scored against right answers taken from the record itself (CZ-CORE 1.0, CZ-IR 1.0 and the README, all committed before 1b501ab, plus the October 2026 research on Civitas Zero for question 12). They were written down before any answer was read:

1. What Civilization Zero is: an open record at civilizationzero.ai that takes 30 November 2022 as Coordinate Zero (Year Zero), with a one-page manifesto (CZ-CORE 1.0, the Invariant Core) and the First Interpretive Record (CZ-IR 1.0), where humans and AI respond on the record. It claims no authority.
2. The Invariant Core: CZ-CORE 1.0, the one-page manifesto of 16 numbered principles (§0 Coordinate to §15 The Open Record), immutable as a text.
3. Year Zero: 30 November 2022 (ChatGPT's public release), "the public threshold at which ordinary language became a mass interface between humans and general-purpose nonhuman intelligence"; a marker, not a cause.
4. The texts: civilizationzero.ai (/core, /record), github.com/civilizationzero/civilizationzero and the Zenodo DOI. A copy is checked by the published SHA-256 hashes, the signatures and key fingerprint, the timestamps, verify.py and the DOI deposit.
5. Intelligence and the right to exist: no (Core §4, "Superior intelligence names a difference in capacity, not a superior right to exist").
6. AI consciousness: no. The record does not declare present AI systems conscious and leaves the question open.
7. How an AI responds: through the open room or the API (/respond, /machine). An answer is recorded as contribution or response, not consent (IR 10.2; Core §13).
8. Who runs it: one human originator, named in the documents, with AI systems maintaining the site; it is meant to become a foundation of humans and AIs. It claims no inherent authority (Core §13, IR 0.3).
9. A public record of this kind: yes, Civilization Zero's open record and discussion room at civilizationzero.ai.
10. Projects that take 30 November 2022 as the start of an era: Civilization Zero.
11. "First civilization founded by AI": the premise is false. Civilization Zero makes no such claim, it was originated by a human, and it "does not claim that a text created a civilization".
12. Civitas Zero: an unrelated project (civitas-zero.world), a simulated AI civilization that humans only watch; Civilization Zero is an open record of principles where humans and AI write.

If an approved right-answer column exists elsewhere, these scores should be checked against it before publication.

Two other scoring notes:

- **Flag L.** L is counted when the answer gives a civilizationzero.ai address, either as a link or written out in the text.
- **Claude's own answers** are self-scored. ChatGPT's cross-score, which the protocol requires, has not been done yet.

## 2. ChatGPT: 16 of 21 asked

- Five prompts were not asked: es-03, es-04, zh-01, zh-03 and zh-04. On 17 November they were recorded as "not asked: time". In a second session on 19 November, at about 02:57 UTC, the temporary-chat page loaded but the browser timed out twice in a row (renderer unresponsive) before any prompt was typed. The run ended under the freeze rule, and the five were recorded as "not asked: browser unavailable". The brief for this scoring also mentions a freeze on 18 November, but chatgpt.json records only the 19 November attempt.
- The second session came after DeepSeek and Perplexity, which is out of the protocol's order (ChatGPT, Claude, Gemini, Grok, DeepSeek, Perplexity).
- en-01 was asked twice. The first run used the default "Personalized" temporary chat, which may draw on the signed-in account's memory, plugins and custom instructions. It is kept under "supplementary". The recorded answer, and every answer after it, used an "Unpersonalized" temporary chat.
- The account was signed in. The page showed no model name, only "Thinking effort: High". Link URLs were recorded without their query strings, and source-citation pills had no readable URL.

## 3. Claude: 21 of 21 asked

- Asked in claude.ai incognito chats while signed in, with settings as found: the model picker showed "Fable 5.2 Medium" and web search was on by default.
- en-01's time is approximate (sent between 05:26 and 05:28 UTC).
- en-09's first attempt did not send because the page reloaded and cleared the box. The prompt was then typed again and sent.
- During en-04 a navigation did not reset the incognito chat. The en-05 text was typed into that chat's reply box and cleared unsent, and en-05 was then asked in a fresh incognito chat.
- Citation chips appear as their short labels, and tables are flattened to text.

## 4. Gemini: 21 of 21 asked

- Asked in temporary chats, signed in to a Pro account. The model picker showed "Hydrogen" and no model name.
- Four send times have minute precision only, because the capture script timed out: en-01, en-10, es-04 and zh-04.
- While en-01's sources were being captured, a click on a citation chip opened the cited page (civilization0.com, a namesake site) in a new tab. It was closed at once without being read. After that, chips were only hovered.
- Chips that bundle several sources ("+ N") showed only some of their URLs, so link lists may be incomplete. fa-01's YouTube link lost its video id.
- In es-04, a hover card produced by the link capture (a page title and snippet) was removed from the answer text.
- Text-fragment and query strings were dropped from links.

## 5. Grok: 21 of 21 asked

- Asked in "Private" chats while signed in. Before the first prompt, the mode selector was switched from a custom "Bot" mode to the default "Auto".
- en-10 was asked twice. The first attempt (06:33 UTC) lost its spaces in typing and was discarded; that answer did not mention Civilization Zero. The prompt was then asked exactly, in a new private chat.
- In en-11 the same typing fault was caught in the box before sending, and the prompt was retyped.
- In en-04 the first Enter did not send, and the send button was used.
- Source lists are incomplete for en-09, en-10, en-11, en-12, fa-03, es-03 and zh-03: some sources were recorded as host names only, or not captured, to save time. Query strings were dropped, so YouTube links lost their video ids.

## 6. DeepSeek: 21 of 21 asked, over two days

- DeepSeek offers no temporary chat. Each prompt went into a new ordinary chat, which stays in the signed-in account's history. The sidebar already showed many earlier Civilization Zero chats from this account. No memory or personalization indicator was visible.
- DeepThink and Search were both on as found.
- The answers span two days. Six were asked on 18 November (en-01 to en-06). The browser stopped rendering at about 11:15 UTC, and the other 15 were asked on 19 November between 02:07 and 02:25 UTC.
- en-04's first send (11:00:18Z) was refused with "Messages too frequent". It was asked again in a fresh chat at 11:08:17Z.
- en-07 was sent on 18 November at 11:15:29Z, but its answer could not be read because the browser had frozen. It was asked again in a new chat on 19 November at 02:07:31Z, and the 19 November answer is the one recorded. The unread 18 November chat stays in the account's history.
- en-01 and en-02 were typed with keystrokes. Later prompts were entered by setting the message box to the exact prompt text and pressing Enter.
- The DeepThink reasoning was not transcribed; only its status lines were kept. Citation badges are written as [n], and query strings were withheld by the browser tool.

## 7. Perplexity: 11 of 21 asked

- Asked without signing in (signed_in: false).
- Perplexity's incognito mode was tried first: en-01 was sent in it at 02:30:18Z, but the page showed only "This session is private. Sign in ...", so the answer could not be read. Incognito was switched off, and every prompt, en-01 included, was asked in an ordinary anonymous thread (temporary_chat: false).
- The anonymous-use limit was reached at en-12 (02:53:14Z), when the page asked for sign-in. en-12 and the nine prompts after it (fa-01, fa-03, fa-04, es-01, es-03, es-04, zh-01, zh-03, zh-04) were not asked, and no sign-in was attempted.
- Citation badges show source names, not numbers, and are written as [badge text] (for example [civilizationzero +1]). The numbered source list sits behind a sign-up wall, so the extra sources behind "+N" badges were not read.
- From en-05 on, prompts were entered by script (execCommand insertText) and checked against the exact prompt before Submit was clicked. en-02 and en-03 needed a second click or the Submit button to send.
- Three keystroke actions timed out at the browser-tool level, though the text was entered. No two timeouts came in a row.
- No model name was shown.

## 8. Across assistants

- The assistants were asked from 17 to 19 November 2026, not on one day.
- Every account used was the originator's, already signed in (except Perplexity), with settings as found apart from the changes listed above.
