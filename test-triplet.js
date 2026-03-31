const { generateArticle } = require('./src/generator');
const db = require('./src/db');

(async () => {
    try {
        console.log('[Test] Initializing DB...');
        await db.init();
        console.log('[Test] Generating Triplet...');
        const result = await generateArticle('triplet');
        console.log('[Test] Result:', JSON.stringify(result, null, 2));
    } catch (err) {
        console.error('[Test] Error:', err);
    } finally {
        process.exit(0);
    }
})();
