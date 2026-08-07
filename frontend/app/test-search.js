require('ts-node').register({ compilerOptions: { module: 'commonjs' } });
const { SearchEngine } = require('./src/lib/searchEngine.ts');
console.log('Testing normal string:');
console.log(SearchEngine.search('ujjain'));
