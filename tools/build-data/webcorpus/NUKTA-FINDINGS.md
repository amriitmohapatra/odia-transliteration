# Nukta behaviour in naturally-written Odia (literature-blogs lane)

corpus: 7200 documents, 2847360 word tokens, 237506 distinct words

## A. Character counts (after NFC, as stored)

| sequence | code points | count |
|---|---|---|
| ଡ଼ decomposed | U+0B21 U+0B3C | 59842 |
| ଢ଼ decomposed | U+0B22 U+0B3C | 10628 |
| any U+0B3C    | U+0B3C        | 70964 |
| precomposed   | U+0B5C/U+0B5D | 0 |
| ୟ (unrelated) | U+0B5F        | 187367 |

U+0B3C not part of a ଡ/ଢ nukta sequence: 494

## B. Pre-NFC probe: do sources emit precomposed U+0B5C/U+0B5D?

re-fetched 29 source URLs, counted code points in the raw response

| code point | count in raw bytes |
|---|---|
| U+0B5C precomposed ଡ଼ | 84 |
| U+0B5D precomposed ଢ଼ | 7 |
| U+0B21/U+0B22 + U+0B3C decomposed | 279 |
| U+0B5F ୟ | 1491 |

pages emitting precomposed forms:
  https://shubhapallaba.in/uttara-pidhi/  U+0B5C=14 U+0B5D=0 decomposed=46
  https://www.odiasahitya.com/smaraniya-lekha/kabya-kabita-smaraniyalekha/sulakhyana/  U+0B5C=26 U+0B5D=1 decomposed=0
  https://smaranika.in/dhanamalire-sunathalire-tote-gela-karibaku-mana-swami-arupananda-lyrics-odia-english/  U+0B5C=29 U+0B5D=0 decomposed=39
  https://odiarasika.in/prafulla-o-kalyanira-kahani-odia-gapa/  U+0B5C=1 U+0B5D=0 decomposed=39
  https://moodiakathakabita.blogspot.com/2022/08/blog-post.html  U+0B5C=2 U+0B5D=0 decomposed=0
  https://sammarpana.blogspot.com/2025/03/blog-post.html  U+0B5C=0 U+0B5D=2 decomposed=0
  https://kichhikatha.wordpress.com/2022/12/13/%e0%ac%b9%e0%ac%bf%e0%ac%a8%e0%ad%8d%e0%ac%a6%e0%ad%80-%e0%ac%97%e0%ad%80%e0%ac%a4-%e0%ac%b9%e0%ac%be%e0%ac%8f-%e0%ac%b0%e0%ac%be%e0%ac%ae%e0%ac%be-%e0%ac%8f-%e0%ac%95%e0%ad%8d%e0%ad%9f%e0%ac%be/  U+0B5C=0 U+0B5D=1 decomposed=6
  https://odishasahitya.com/anarchy/  U+0B5C=9 U+0B5D=0 decomposed=19
  https://hiteshguideline.wordpress.com/2021/09/05/%f0%9f%99%8f-%e0%ac%a6%e0%ad%81%e0%ac%a8%e0%ac%bf%e0%ac%86%e0%ac%b0-%e0%ac%b8%e0%ac%b0%e0%ad%8d%e0%ac%ac%e0%ac%b6%e0%ad%8d%e0%ac%b0%e0%ad%87%e0%ac%b7%e0%ad%8d%e0%ac%a0-%e0%ac%97%e0%ad%81%e0%ac%b0/  U+0B5C=3 U+0B5D=0 decomposed=3
  https://odiapuo.wordpress.com/2021/07/21/%e0%ac%a6%e0%ad%8b-%e0%ac%9b%e0%ac%95%e0%ac%bf%e0%ac%b0%e0%ad%87-%e0%ac%ae%e0%ad%81%e0%ac%81-%e0%ad%a8/  U+0B5C=0 U+0B5D=3 decomposed=13

## C. Nukta-drop rate (post-NFC minimal pairs)

distinct words containing a nukta: 10914  (69710 tokens, 2.45% of corpus)
of those, words whose nukta-stripped spelling ALSO occurs: 2452

Word-initial pairs are excluded from the rate below. Odia has no
word-initial ଡ଼/ଢ଼, so in those 195 pairs the *bare* spelling is the correct
one and counting them as 'dropped' inverts the measurement. Examples:
  ଡ଼ାକ(13) vs ଡାକ(399)  <- ଡାକ is correct
  ଡ଼(15) vs ଡ(371)  <- ଡ is correct
  ଡ଼ାକି(13) vs ଡାକି(346)  <- ଡାକି is correct
  ଡ଼ାକ୍ତର(5) vs ଡାକ୍ତର(318)  <- ଡାକ୍ତର is correct
  ଢ଼େର(37) vs ଢେର(253)  <- ଢେର is correct
  ଡ଼ର(16) vs ଡର(242)  <- ଡର is correct

Over word-medial contested pairs (2257 pairs):
  nukta written : 53070 tokens (80.0%)
  nukta dropped : 13277 tokens (20.0%)

Top contested pairs (word-medial only):

| nukta spelling | n | bare spelling | n | drop % |
|---|---|---|---|---|
| ଓଡ଼ିଆ | 3993 | ଓଡିଆ | 167 | 4.0 |
| ବଡ଼ | 3316 | ବଡ | 565 | 14.6 |
| ଓଡ଼ିଶା | 1797 | ଓଡିଶା | 101 | 5.3 |
| ଛାଡ଼ି | 1439 | ଛାଡି | 360 | 20.0 |
| ଓଡ଼ିଶାର | 1261 | ଓଡିଶାର | 79 | 5.9 |
| ପଡ଼ିଲା | 951 | ପଡିଲା | 274 | 22.4 |
| ପଡ଼ି | 919 | ପଡି | 217 | 19.1 |
| ଓଡ଼ିଶାରେ | 815 | ଓଡିଶାରେ | 47 | 5.5 |
| ଆଡ଼କୁ | 549 | ଆଡକୁ | 130 | 19.1 |
| ପଡ଼େ | 548 | ପଡେ | 109 | 16.6 |
| ପଡ଼ିବ | 512 | ପଡିବ | 128 | 20.0 |
| ପଡ଼ିଲେ | 473 | ପଡିଲେ | 132 | 21.8 |
| କୁଆଡ଼େ | 472 | କୁଆଡେ | 101 | 17.6 |
| ବୁଢ଼ା | 433 | ବୁଢା | 110 | 20.3 |
| ଏଡ଼େ | 469 | ଏଡେ | 51 | 9.8 |
| ବୁଢ଼ୀ | 436 | ବୁଢୀ | 51 | 10.5 |
| ଗୋଡ଼ | 410 | ଗୋଡ | 45 | 9.9 |
| ମାଡ଼ି | 384 | ମାଡି | 66 | 14.7 |
| ଯୋଡ଼ି | 377 | ଯୋଡି | 70 | 15.7 |
| ପଢ଼ି | 275 | ପଢି | 138 | 33.4 |
| ପଡ଼ିଛି | 310 | ପଡିଛି | 83 | 21.1 |
| ଛିଡ଼ା | 329 | ଛିଡା | 60 | 15.4 |
| ଗାଡ଼ି | 318 | ଗାଡି | 54 | 14.5 |
| ଛଡ଼ା | 305 | ଛଡା | 56 | 15.5 |
| ଦୃଢ଼ | 279 | ଦୃଢ | 67 | 19.4 |
| ବଢ଼ି | 271 | ବଢି | 49 | 15.3 |
| ଘୋଡ଼ା | 222 | ଘୋଡା | 87 | 28.2 |
| ଛାଡ଼ | 228 | ଛାଡ | 47 | 17.1 |
| ଉଡ଼ି | 211 | ଉଡି | 64 | 23.3 |
| କେଡ଼େ | 204 | କେଡେ | 50 | 19.7 |
| ପାହାଡ଼ | 225 | ପାହାଡ | 26 | 10.4 |
| କାଢ଼ି | 196 | କାଢି | 55 | 21.9 |
| ଜଡ଼ିତ | 193 | ଜଡିତ | 34 | 15.0 |
| ଲୋଡ଼ା | 193 | ଲୋଡା | 31 | 13.8 |
| ପଡ଼ିଗଲା | 173 | ପଡିଗଲା | 47 | 21.4 |
| ହାଡ଼ | 204 | ହାଡ | 12 | 5.6 |
| ଗଢ଼ି | 183 | ଗଢି | 33 | 15.3 |
| ଗଢ଼ା | 189 | ଗଢା | 21 | 10.0 |
| ଧାଡ଼ି | 187 | ଧାଡି | 23 | 11.0 |
| ପଡ଼ଇ | 164 | ପଡଇ | 40 | 19.6 |
| ପଡ଼ିଥିଲା | 158 | ପଡିଥିଲା | 46 | 22.5 |
| ବାଡ଼ି | 189 | ବାଡି | 14 | 6.9 |
| ମାଡ଼ | 187 | ମାଡ | 16 | 7.9 |
| ପଡ଼ୁଛି | 105 | ପଡୁଛି | 96 | 47.8 |
| ଗୁଡ଼ାଏ | 183 | ଗୁଡାଏ | 17 | 8.5 |

### Drop rate by register

| register | nukta tokens | bare tokens | drop % |
|---|---|---|---|
| contemporary (blogs, magazines) | 25744 | 6732 | 20.7 |
| classical (Wikisource books) | 27326 | 6374 | 18.9 |

## D. Drop rate by source

| source | docs | tokens w/ nukta | tokens bare-variant | drop % |
|---|---|---|---|---|
| wikisource-bookpages | 4094 | 17999 | 3417 | 16.0 |
| wikisource-works | 336 | 9327 | 2957 | 24.1 |
| odiasahitya | 464 | 7630 | 861 | 10.1 |
| odishasahitya | 800 | 5354 | 2051 | 27.7 |
| shubhapallaba | 787 | 4839 | 149 | 3.0 |
| odiarasika | 252 | 1338 | 1555 | 53.8 |
| blog-kantiokatha | 72 | 2180 | 141 | 6.1 |
| blog-helloodia | 60 | 878 | 278 | 24.0 |
| smaranika | 38 | 876 | 18 | 2.0 |
| blog-sammarpana | 49 | 451 | 340 | 43.0 |
| blog-odiavasa | 10 | 710 | 79 | 10.0 |
| blog-kichhikatha | 33 | 505 | 44 | 8.0 |
| stories-hiteshguideline | 48 | 91 | 425 | 82.4 |
| blog-odiapuo | 28 | 141 | 356 | 71.6 |
| blog-odianadia | 39 | 309 | 138 | 30.9 |
| blog-sahadevodia | 13 | 173 | 81 | 31.9 |
| blog-odiagapas | 8 | 73 | 14 | 16.1 |
| lyrics-bhajan | 19 | 22 | 63 | 74.1 |
| blog-moodiakathakabita | 6 | 39 | 36 | 48.0 |
| blog-moodishamuodia | 10 | 5 | 46 | 90.2 |
| blog-odiaghara | 8 | 36 | 12 | 25.0 |
| blog-unnata-utkala | 7 | 43 | 4 | 8.5 |
| blog-odiagapa0 | 1 | 19 | 22 | 53.7 |
| odiabibhaba | 2 | 17 | 0 | 0.0 |
| lyrics-a2z | 9 | 4 | 11 | 73.3 |
| recipes-odishafooddelite | 2 | 3 | 4 | 57.1 |
| blog-odiakathani | 1 | 6 | 1 | 14.3 |
| blog-odiageetagapa | 1 | 0 | 3 | 100.0 |
| odialive | 3 | 2 | 0 | 0.0 |

