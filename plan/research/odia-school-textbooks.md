# Odisha Odia textbooks: where they are, formats, licences

Research date: 2026-10-14. Read-only research. No whole textbook was downloaded. Format checks used HEAD requests and byte-range requests: the first 0.1–1.5 MB of a file, a slice from the middle, or the last 40–300 KB. Four small files were fetched whole, and none of them is a textbook: the CIIL Odia primer (10 MB), the CBSE Odia syllabus (0.6 MB), one DIKSHA grammar question sheet (0.1 MB) and one NIOS chapter (0.15 MB).

**Unreachable from this environment:** `scert.odisha.gov.in`, `scertodisha.nic.in`, `sme.odisha.gov.in` and `textbookbureau.odisha.gov.in` returned HTTP 503 or a reset connection. This was probably geo-blocking. What those sites hold is **not verified**. It does not mean they are empty. The owner, in India, should open them.

## 1. Who publishes what

- **SCERT Odisha** writes the books for Classes 1–8. OSEPA (the Odisha School Education Programme Authority) hosts the e-books. A new set was introduced for 2026-27.
- **BSE Odisha** (Board of Secondary Education) publishes the books for Classes 9–10. The CBSE Odia syllabus (subject code 013) prescribes these same BSE books.
- **CHSE Odisha** covers Classes 11–12 (+2). The Textbook Bureau prints some of these books.
- **NCERT** publishes no Odia language textbooks. None were found. NCERT and CIIL did co-publish an Odia *primer* in 2024.
- **Odia as a second or third language:** no such book appeared on any index page that could be checked. This is a finding: it is not on these pages. Whether such books exist elsewhere is not verified.

## 2. Table of sources

| # | Source | URL | Classes / subjects | Format (checked) | Licence / terms | Glossary / grammar |
|---|---|---|---|---|---|---|
| 1 | **OSEPA e-Textbooks** (official, Govt of Odisha) | https://osepa.odisha.gov.in/?p=content&page=26 | Cl 1–2 *Jhulana*; Cl 3–5 *Bhasa Mahak 1–3* (Odia); Cl 6 *Sahitya Sudha*; Cl 7 *Sahitya Suman*; Cl 8 *Sahitya Suravi*; Cl 9 *Sahitya Dhara* + *Madhyamika Byakarana*; Cl 10 *Sahitya Sindhu* + *Madhyamika Byakarana*. Also *Ujjwal* and *Utthan* Odia remedial booklets. | Cl 1–8: new 2026-27 books, files dated May 2026, 32–70 MB each. The Cl 6 book has its **text turned into vector outlines**: no fonts and no text operators, so it needs rendering and OCR. Cl 9–10: older PageMaker 6.5 files from 2019–2020 (0.4–0.6 MB). Examples: "Grammer Odia-X-2012 (Corrected)" has 80 pages and Sahitya Sindhu has 140. They use **legacy MSTT31 TrueType fonts with no ToUnicode map**, so the text layer is unusable. They are vector files, so they render cleanly and OCR well. | Footer: "© OSEPA. All rights reserved." No licence is stated for the books. Copyright: Govt of Odisha / SCERT / BSE. | Cl 9–10 grammar books cover the topics in row 6. In-book ଶବ୍ଦାର୍ଥ (word meanings) sections: **not verified**, because no page was OCR'd. |
| 2 | **DIKSHA, board "State (Odisha)"** (national platform, state tenant) | https://diksha.gov.in (API `content/v1/search`, board = "State (Odisha)") | 176 "Digital Textbook" records. Odia-language ones include *Hasa Khela 1–2*, *Hasa Khusi*, *Ama Bhasa Ama Sahitya-3*, *Sahitya Kalika-4*, *Sahitya Kusum-5*, *Ama Sahitya-6*, *Sahitya Saurabh-7*, *Sahityika-8*, *Sarala Sahitya-8*, **Ama Odia Byakarana-8**, *Sahitya Dhara-9*, **Madhyamika Byakarana-9 and -10**, *Sahitya Sindhu-10*, CHSE *Sahitya Jyoti*, *Sahitya Dipti* and **Byakarana Darpan** (Cl 11–12), and *Utkarsh* Odia handbooks (Cl 9). | Full-book PDFs of the **2019-generation** Cl 1–8 books (13–49 MB each). Cl 8 grammar is CorelDRAW output passed through ilovepdf, with no fonts, so it needs OCR. Workbooks are PageMaker files with legacy fonts. The Cl 9 grammar question sheets are Word files in the Kalinga font: they have a Unicode text layer, but extraction comes out **corrupted** (vowel signs in the wrong order). Most other items are videos. | **Per-item Creative Commons licences.** Every one of the eight full textbook PDFs is tagged **CC BY-ND 4.0** (copyright "Odisha"). The tag is the same on all eight, so it looks like a deliberate publisher choice. Supplements (workbooks, *Vidya Prabesh* handbooks, *Shikhar* bridge course, Cl 9–10 grammar lesson PDFs and question sheets, Utkarsh handbook) are **CC BY 4.0**. Some Cl 9 worksheets are CC BY-NC-SA 4.0. The CC BY 4.0 tag on a collection record (for example JHULANA 2026, whose items are empty) does **not** mean the 2026 books are openly licensed. | Unit titles confirmed: Cl 4 "ଶବ୍ଦ - ଅର୍ଥ" (word – meaning); Cl 9 grammar units ଉପସର୍ଗ (prefixes), ତଦ୍ଧିତ and କୃଦନ୍ତ (suffix types), ସମାସ (compounds), ସନ୍ଧି (sandhi), ଶବ୍ଦ ଗଠନ (word formation); Utkarsh units on ବନାନ ଶୁଦ୍ଧି (spelling correction), ପ୍ରତ୍ୟୟ (suffixes), ସନ୍ଧି, ସମାସ and ଶବ୍ଦକୋଷ (vocabulary). |
| 3 | **CHSE Odisha study materials** (distance education) | https://chseodisha.nic.in/study_materials/ | +2 *Sahitya Jyoti Ekadasha* (Cl 11) and *Dwadasha* (Cl 12), the MIL Odia anthology. The "Free Text Book" and "Publications" pages are empty. | **Scanned**: full-page CCITT bilevel images at 1248×1754 px (about 150 dpi). OCR is possible but the resolution is low. Files are 5.7 and 10.8 MB, dated May 2025. | Site footer: "All Rights are Reserved". No licence is stated for the books. | Not verified. Third-party sites list an Odia grammar book for +2, but no official copy was found. DIKSHA's *Byakarana Darpan* records hold only empty units. |
| 4 | **BSE Odisha site** | https://bseodisha.ac.in/CL-IX-Text-Book.html and https://bseodisha.ac.in/CL-X-Text-Book.html | Only Life Science, Geography/Economics and Disaster Management. **No Odia books.** | n/a | Footer: "All Rights Reserved at Board of School Education Odisha, 2015-2019" | n/a |
| 5 | **SCERT Odisha / S&ME Dept / Textbook Bureau** | scert.odisha.gov.in (a textbook list for Class I–X is reported), https://sme.odisha.gov.in/en/text-books-for-class-x (search snippet shows "Odia-Grammar Book" 213 KB and "Odia- Text Book" 419 KB), textbookbureau.odisha.gov.in | Not verified | Unreachable from here | Not verified. The Textbook Bureau site says "All Rights Reserved, 2011" (search snippet). | Not verified |
| 6 | **CBSE Odia syllabus 2026-27** (code 013) | https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart1/Odia_SecP1_2026-27.pdf | Prescribes BSE "Sahitya Dhara (Class-IX)-2023 (Revised Edition)", "Madhyamika Byakarana (Class IX) – 2023 (Revised Edition)", "Sahitya Sindhu (Class-X)-2024 (Revised Edition)", "Madhyamika Byakarana (Class X) – 2024 (Revised Edition)". | Word PDF with a text layer | Syllabus only | Cl 9 grammar: Sandhi (Swara, Byanjana, Bisarga), Samasa (six types), Taddhita, Krudanta. Cl 10 grammar: Chhanda, sentence transformation, idioms, "Correction of Common Errors in Words". |
| 7 | **CIIL–NCERT Odia Primer** | https://www.ciil.gov.in/primers/Odia_Primer.pdf | Pre-school and adult literacy reader; 78 pages; first edition December 2024 | Word file in Kalinga font. It has a Unicode text layer, but extraction is partly corrupted. | "© CIIL & NCERT 2024 / All rights reserved. No part of this primer may be reproduced, stored in a retrieval system, or transmitted into any form or by any means, electronic, mechanical, photocopying and recording or otherwise, without the prior permission of the publisher." | Picture-word lists, Odia–Hindi–English |
| 8 | **NIOS Odia (course 305)** | https://rcbhubaneswar.nios.ac.in/odia-305.html (23 chapter PDFs, e.g. https://cdn.nios.ac.in/cms/documents/2020/Jul/04/305_CH_1.pdf) | Odia language, open schooling. The level is not stated on the page. | Text PDF in the legacy **AkrutiOriSarala-99** font. It extracts as legacy-encoded ASCII, so a converter written for that font would recover the text. | Page footer: "Copyright © National Institute of Open Schooling 2020. All rights reserved." A CIS India paper says NIOS released OER under CC BY-NC-SA. **Not verified for this course.** | Not verified |
| 9 | **StoryWeaver (Pratham Books)** | https://storyweaver.org.in (API: 462 Odia books, levels 1–4) | Children's stories, graded by reading level | Web or HTML text; downloads available | **CC BY 4.0**, as stated on StoryWeaver's open-content page (read in a search snippet; the terms page did not render here). Attribution is required to Pratham Books, the donor or funder, the author, the illustrator and the translator. Each book carries a notice such as "'Se Hasidela' has been published on StoryWeaver by Pratham Books." | No glossaries. Good for graded everyday vocabulary. |
| 10 | **Odia Wikisource / Wiktionary** | https://or.wikisource.org, https://or.wiktionary.org | Public-domain and CC-licensed texts; dictionary entries | Unicode wiki text | CC BY-SA 4.0 (Wikimedia project policy). Size **not verified** (the API refused because of rate limits). | Wiktionary has meanings. Odia **Wikibooks does not exist**: it is in the Incubator only. |

Third-party mirrors (utkaliit.in, aglasem.com, selfstudys.com, withteachers.in, Play Store apps) re-host the same government PDFs. They add no rights and should not be used as sources.

## 3. Formats in short

- **2026-27 Classes 1–8 (OSEPA):** text is drawn as vector outlines. Render the pages and OCR them.
- **Classes 9–10 (OSEPA):** PageMaker files with legacy fonts and no Unicode mapping. Render at 300 dpi and OCR. The vector pages should give clean OCR.
- **CHSE +2:** 150 dpi bilevel scans. OCR is possible but expect more errors. Upscaling may help.
- **DIKSHA full books:** OCR.
- **DIKSHA Word/Kalinga sheets** and the **CIIL primer:** Unicode, but the extracted text is scrambled. OCR, or repair the vowel-sign order.
- **NIOS:** legacy Akruti encoding. Convert with a mapping table.
- **Tesseract `ori`** is the obvious OCR engine. Its accuracy on these books has not been measured.
- **The nukta invariant still applies.** Odia OCR output must pass through `canonical()`, because OCR engines often emit the precomposed U+0B5C and U+0B5D.

## 4. Spelling caution

The new 2026-27 SCERT books for Classes 1–8 were reported to contain about **1,678 errors**, including spelling and grammar mistakes. SCERT called them an "experimental edition". Corrected books are promised for the **2027-28** session. Revised Class 1–4 files were posted for public feedback. Sources: [The Wire](https://m.thewire.in/article/education/gretest-instead-of-greatest-hampi-instead-of-konark-over-1600-errors-in-odishas-new-textbooks), [OdishaBytes](https://odishabytes.com/1678-errors-detected-in-odisha-school-textbooks/), [OrissaPOST](https://www.orissapost.com/textbook-errors-wont-recur-next-year-promises-scert-director/).

Do not treat the 2026-27 books as a spelling authority without a native-speaker check. The older Class 9–10 BSE grammars are stable. However, the online files are 2012/2019 texts, while CBSE cites 2023 and 2024 revised editions. Where those revised editions are online is **not verified**.

## 5. Best three candidates

To rank as "best", a source must have the content the owner needs **and** a licence that allows the derived use (a glossary or rules inside an MIT app).

1. **DIKSHA Odisha CC BY 4.0 items.** These are the Class 9 *Madhyamika Byakarana* unit sheets on ସମାସ and ଶବ୍ଦ ଗଠନ, the Class 10 grammar lesson PDFs (ଛନ୍ଦ, ଅଳଙ୍କାର, letter writing), the *Utkarsh* Odia handbook units (ବନାନ ଶୁଦ୍ଧି, ପ୍ରତ୍ୟୟ, ସନ୍ଧି, ସମାସ, ଶବ୍ଦକୋଷ), and the *Bhasa Karya Pustika* workbooks.
   - **Why:** official state material, real grammar and spelling content, and an explicit CC BY 4.0 tag on each item.
   - **Caution:** credit "Odisha / OSEPA / SCERT" as each item's copyright field says. The licence is per item, so record each item's ID and licence. Do not assume the tag carries over to the full books (they are ND). DIKSHA's Terms of Use say users must not "modify, adapt, translate or create derivative works based upon Content on DIKSHA or any part thereof, except and only to the extent expressly permitted by the license applicable to such Content". So the item's tag is what governs. The same page's phrase "placed in public domain" is loose drafting; do not rely on it.
2. **OSEPA e-Textbooks, Classes 1–10.** This is the most complete official set, including the Class 9–10 *Madhyamika Byakarana* with full prefix, suffix, compound and sandhi chapters.
   - **Why:** best coverage of vocabulary by class, plus the standard grammar.
   - **Caution:** "All rights reserved". No open licence is stated. Indian government works are protected by copyright (60 years); they are **not** public domain. Use is **permission-only**. The 2019 versions of the Class 1–8 books on DIKSHA are **CC BY-ND 4.0**. Extracting their glossaries and rules into a dataset is most plausibly an adaptation, which ND forbids distributing. Single word meanings are facts, but a curated glossary is a protected compilation. This needs an owner decision or written permission. It is not settled either way.
3. **StoryWeaver Odia (462 books).**
   - **Why:** clear CC BY 4.0, Unicode text, levelled by reading age. Good for frequency and coverage lists and for test sentences.
   - **Caution:** credit Pratham Books, the funder, the author, the illustrator and the translator, per book. The licence was confirmed from the open-content statement, not the full terms page. Some books include third-party illustrations, so check per title. There is no glossary or grammar content.

The CHSE *Sahitya Jyoti* books are also useful (+2 literary vocabulary), but they are scanned, all rights reserved, and in the same permission-only position as OSEPA.

## 6. Recommended next step

Two tracks, side by side:

- **(a) Permission.** Send a written request to OSEPA, SCERT Odisha, BSE Odisha and the Textbook Bureau, covering the e-textbooks, including the CC BY-ND DIKSHA PDFs. Follow the Desh L-1 process: state the use (extract chapter glossaries and grammar rules, credited, inside a free MIT app) and ask for written terms. Record the request as a new owner follow-up.
- **(b) Pilot and build.**
  1. While waiting, run a one-page OCR pilot for internal measurement only. Render one page of the OSEPA Class 9 *Madhyamika Byakarana* at 300 dpi, run Tesseract `ori`, and measure the character error rate after `canonical()`.
  2. Build only from CC BY 4.0 DIKSHA items and StoryWeaver until the permission arrives. Log each item ID, licence and checksum in `core/data/PROVENANCE.md`.
  3. The owner should open the four unreachable Odisha sites from India, to confirm the 2026 SCERT list and to find the 2023/2024 revised BSE editions.
