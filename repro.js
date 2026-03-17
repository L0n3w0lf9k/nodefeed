
const textContent1 = 'I need to find something. Here is the JSON: {"title": "Test"}';
const textContent2 = '{"title": "Test"} I hope you like it.';
const textContent3 = 'I need to... { "title": "Test" }';

function test(text) {
    console.log('Testing:', text);
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
        console.log('No JSON found');
    } else {
        try {
            const parsed = JSON.parse(jsonMatch[0].trim());
            console.log('Successfully parsed:', parsed);
        } catch (e) {
            console.log('Failed to parse:', e.message);
        }
    }
}

test(textContent1);
test(textContent2);
test(textContent3);

const textContentMulti = '{ "thought": "I need to..." } { "title": "Test" }';
test(textContentMulti);
