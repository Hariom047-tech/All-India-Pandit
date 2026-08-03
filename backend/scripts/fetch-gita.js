const fs = require('fs');
const path = require('path');

const API_BASE = 'https://vedicscriptures.github.io';
const OUTPUT_PATH = path.join(__dirname, '../src/data/knowledge/scriptures/bhagavad-gita.json');

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchWithRetry(url, retries = 3, delayMs = 500) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }
      return await res.json();
    } catch (err) {
      if (attempt === retries) throw err;
      console.warn(`Attempt ${attempt} failed for ${url}: ${err.message}. Retrying in ${delayMs}ms...`);
      await delay(delayMs);
    }
  }
}

async function main() {
  console.log('Fetching Bhagavad Gita chapters metadata...');
  
  const chaptersData = await fetchWithRetry(`${API_BASE}/chapters`);
  console.log(`Fetched ${chaptersData.length} chapters metadata.`);

  const result = {
    chapters: []
  };

  let totalVersesFetched = 0;

  for (const ch of chaptersData) {
    const chNum = ch.chapter_number;
    const verseCount = ch.verses_count;

    console.log(`Processing Chapter ${chNum}: ${ch.translation || ch.name} (${verseCount} verses)...`);

    const chapterObj = {
      chapterNumber: chNum,
      name: ch.name || '',
      translation: ch.translation || '',
      summary: ch.summary?.en || (typeof ch.summary === 'string' ? ch.summary : ''),
      verses: []
    };

    for (let verseNum = 1; verseNum <= verseCount; verseNum++) {
      await delay(200);
      try {
        const verseData = await fetchWithRetry(`${API_BASE}/slok/${chNum}/${verseNum}`);
        
        const tejTranslation = verseData.tej?.ht || (typeof verseData.tej === 'string' ? verseData.tej : '');

        chapterObj.verses.push({
          verse: verseData.verse || verseNum,
          slok: verseData.slok || '',
          transliteration: verseData.transliteration || '',
          tej: tejTranslation
        });

        totalVersesFetched++;
      } catch (err) {
        console.error(`Failed to fetch Chapter ${chNum} Verse ${verseNum}: ${err.message}. Skipping...`);
      }
    }

    result.chapters.push(chapterObj);
    console.log(`Finished Chapter ${chNum}: ${chapterObj.verses.length}/${verseCount} verses fetched successfully.`);
  }

  // Ensure output directory exists
  const outDir = path.dirname(OUTPUT_PATH);
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(result, null, 2), 'utf-8');
  console.log(`\nSuccessfully saved complete Bhagavad Gita data to: ${OUTPUT_PATH}`);
  console.log(`Total Chapters: ${result.chapters.length}`);
  console.log(`Total Verses Fetched: ${totalVersesFetched}`);
}

main().catch((err) => {
  console.error('Fatal error running fetch-gita script:', err);
  process.exit(1);
});
