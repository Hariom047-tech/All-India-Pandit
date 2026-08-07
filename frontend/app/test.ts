import { SearchEngine } from './src/lib/searchEngine';
try {
    console.log('Testing...');
    const result = SearchEngine.search('ujjain');
    console.log('SUCCESS, pandits:', result.pandits.length);
} catch (e) {
    console.error('ERROR:', e);
}
